sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/ccb/viaticos/model/formatter"
], function (Controller, JSONModel, formatter) {
    "use strict";

    // Intervalo de polling para consultar el estado del OCR (en milisegundos)
    var INTERVALO_POLLING_MS = 2000;
    // Tamaño máximo permitido por archivo (10 MB)
    var TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
    // Extensiones de archivo aceptadas
    var EXTENSIONES_VALIDAS = ["pdf", "xml"];

    return Controller.extend("com.ccb.viaticos.controller.CargaPC", {

        formatter: formatter,

        /**
         * Inicialización de la vista de carga de facturas desde PC
         */
        onInit: function () {
            var oViewModel = new JSONModel({
                archivos: [],
                errorFormato: false,
                errorTamano: false,
                mensajeErrorTamano: "",
                subiendo: false,
                procesando: false,
                porcentajeCarga: 0,
                mensajeError: "",
                mostrarError: false
            });
            this.getView().setModel(oViewModel, "vm");

            // Arreglo paralelo de objetos File (no serializables en el modelo JSON)
            this._aArchivos = [];

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteCargaPC").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Reinicia el estado de la vista al navegar a ella
         * @private
         */
        _onRoutePatternMatched: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setData({
                archivos: [],
                errorFormato: false,
                errorTamano: false,
                mensajeErrorTamano: "",
                subiendo: false,
                procesando: false,
                porcentajeCarga: 0,
                mensajeError: "",
                mostrarError: false
            });
            this._aArchivos = [];
        },

        /**
         * Configura los manejadores de eventos drag & drop sobre la zona
         * de carga una vez que el HTML ha sido renderizado
         */
        onDropZoneRenderizada: function () {
            var oZona = document.getElementById("zonaDropArchivo");
            if (!oZona || oZona.dataset.bound) {
                return;
            }
            oZona.dataset.bound = "true";

            oZona.addEventListener("click", this.onAbrirSelectorArchivo.bind(this));

            oZona.addEventListener("dragover", function (oEvento) {
                oEvento.preventDefault();
                oZona.classList.add("dropZoneActiva");
            });

            oZona.addEventListener("dragleave", function () {
                oZona.classList.remove("dropZoneActiva");
            });

            oZona.addEventListener("drop", function (oEvento) {
                oEvento.preventDefault();
                oZona.classList.remove("dropZoneActiva");
                var aArchivos = oEvento.dataTransfer.files;
                if (aArchivos && aArchivos.length > 0) {
                    this._procesarArchivosSeleccionados(aArchivos);
                }
            }.bind(this));
        },

        /**
         * Abre el selector de archivos del sistema operativo
         */
        onAbrirSelectorArchivo: function () {
            var oFileUploader = this.byId("fileUploader");
            oFileUploader.$().find("input[type=file]").trigger("click");
        },

        /**
         * Manejador del control FileUploader cuando se seleccionan archivos
         */
        onArchivosSeleccionados: function (oEvent) {
            var aArchivos = oEvent.getParameter("files");
            if (aArchivos && aArchivos.length > 0) {
                this._procesarArchivosSeleccionados(aArchivos);
            }
        },

        /**
         * Valida el formato (.pdf / .xml) y tamaño (máx. 10MB) de cada archivo
         * seleccionado y los agrega a la lista de archivos pendientes de carga
         * @param {FileList|Array<File>} aArchivos - archivos seleccionados por el usuario
         * @private
         */
        _procesarArchivosSeleccionados: function (aArchivos) {
            var oViewModel = this.getView().getModel("vm");
            var oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();

            oViewModel.setProperty("/errorFormato", false);
            oViewModel.setProperty("/errorTamano", false);
            oViewModel.setProperty("/mostrarError", false);

            var aListaActual = oViewModel.getProperty("/archivos");
            var bErrorFormato = false;
            var bErrorTamano = false;
            var sMensajeTamano = "";

            for (var i = 0; i < aArchivos.length; i++) {
                var oArchivo = aArchivos[i];
                var sExtension = oArchivo.name.split(".").pop().toLowerCase();

                if (EXTENSIONES_VALIDAS.indexOf(sExtension) === -1) {
                    bErrorFormato = true;
                    continue;
                }

                if (oArchivo.size > TAMANO_MAXIMO_BYTES) {
                    bErrorTamano = true;
                    sMensajeTamano = oBundle.getText("errTamanoExcedido", [oArchivo.name]);
                    continue;
                }

                this._aArchivos.push(oArchivo);
                aListaActual.push({
                    nombreArchivo: oArchivo.name,
                    tamanoArchivo: formatter.formatoTamanoArchivo(oArchivo.size)
                });
            }

            oViewModel.setProperty("/archivos", aListaActual);
            oViewModel.setProperty("/errorFormato", bErrorFormato);
            oViewModel.setProperty("/errorTamano", bErrorTamano);
            oViewModel.setProperty("/mensajeErrorTamano", sMensajeTamano);
        },

        /**
         * Elimina un archivo de la lista de archivos pendientes de carga
         * @param {sap.ui.base.Event} oEvento - evento de presión del botón eliminar
         */
        onEliminarArchivo: function (oEvento) {
            var oViewModel = this.getView().getModel("vm");
            var oContexto = oEvento.getSource().getBindingContext("vm");
            var iIndice = parseInt(oContexto.getPath().split("/").pop(), 10);

            var aListaActual = oViewModel.getProperty("/archivos");
            aListaActual.splice(iIndice, 1);
            this._aArchivos.splice(iIndice, 1);
            oViewModel.setProperty("/archivos", aListaActual);
        },

        /**
         * Sube todos los archivos seleccionados al backend (CPI) mostrando una
         * barra de progreso y luego inicia el polling del estado de OCR del lote
         * Endpoint: POST /http/api/v1/facturas/cargar
         */
        onCargarFacturas: function () {
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();

            if (!this._aArchivos.length) {
                return;
            }

            oViewModel.setProperty("/subiendo", true);
            oViewModel.setProperty("/porcentajeCarga", 0);
            oViewModel.setProperty("/mostrarError", false);

            var oFormData = new FormData();
            this._aArchivos.forEach(function (oArchivo) {
                oFormData.append("archivos", oArchivo, oArchivo.name);
            });
            oFormData.append("origen", "pc");

            oApiService.postFormData("/api/v1/facturas/cargar", oFormData, function (iPorcentaje) {
                oViewModel.setProperty("/porcentajeCarga", iPorcentaje);
            }.bind(this))
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/subiendo", false);
                    oViewModel.setProperty("/procesando", true);
                    oViewModel.setProperty("/porcentajeCarga", 0);

                    if (!oRespuesta || !oRespuesta.jobs || !oRespuesta.jobs.length) {
                        throw { message: "errorGenerico" };
                    }
                    var aJobIds = oRespuesta.jobs.map(function (oJob) {
                        return oJob.jobId;
                    });
                    return this._iniciarPollingOcrLote(aJobIds);
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/subiendo", false);
                    oViewModel.setProperty("/procesando", false);
                    oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                    oViewModel.setProperty("/mostrarError", true);
                }.bind(this));
        },

        /**
         * Realiza polling al endpoint de estado del OCR del lote hasta que todos
         * los documentos finalicen su procesamiento y navega automáticamente a la Vista 5
         * Endpoint: GET /http/api/v1/facturas/ocr/lote?jobIds=...
         * @param {Array<string>} aJobIds - identificadores de los jobs de OCR
         * @private
         */
        _iniciarPollingOcrLote: function (aJobIds) {
            var oApiService = this.getOwnerComponent().getApiService();
            var oRouter = this.getOwnerComponent().getRouter();
            var oViewModel = this.getView().getModel("vm");
            var sJobIds = aJobIds.join(",");
            var iProgreso = 0;

            return new Promise(function (resolve, reject) {
                var consultarEstado = function () {
                    oApiService.get("/api/v1/facturas/ocr/lote?jobIds=" + encodeURIComponent(sJobIds))
                        .then(function (oRespuesta) {
                            var aResultados = (oRespuesta && oRespuesta.resultados) || [];
                            var bTodosCompletados = aResultados.length === aJobIds.length &&
                                aResultados.every(function (oResultado) {
                                    return oResultado.status === "completado";
                                });
                            var bAlgunError = aResultados.some(function (oResultado) {
                                return oResultado.status === "error";
                            });

                            if (bAlgunError) {
                                reject({ message: "errorGenerico" });
                            } else if (bTodosCompletados) {
                                oViewModel.setProperty("/porcentajeCarga", 100);
                                resolve(aResultados);
                                // Transición automática a la Vista 5 (Revisión de datos)
                                oRouter.navTo("RouteRevisionDatos", { jobIds: sJobIds });
                            } else {
                                // Avance visual incremental mientras se espera el resultado
                                iProgreso = Math.min(iProgreso + 10, 90);
                                oViewModel.setProperty("/porcentajeCarga", iProgreso);
                                setTimeout(consultarEstado, INTERVALO_POLLING_MS);
                            }
                        })
                        .catch(reject);
                };
                consultarEstado();
            });
        },

        /**
         * Vuelve al dashboard
         */
        onVolver: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMain");
        },

        /**
         * Traduce un error técnico en un mensaje legible para el usuario
         * @private
         */
        _mensajeDeError: function (oError) {
            var oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            if (oError && oError.status === 0) {
                return oBundle.getText("errorConexion");
            }
            return oBundle.getText("errorGenerico");
        }
    });
});
