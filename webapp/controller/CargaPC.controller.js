sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/ccb/viaticos/model/formatter"
], function (Controller, JSONModel, formatter) {
    "use strict";

    // Intervalo de polling para consultar el estado del OCR (en milisegundos)
    var INTERVALO_POLLING_MS = 2000;
    // Tamaño máximo permitido del archivo (10 MB)
    var TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
    // Extensiones de archivo aceptadas
    var EXTENSIONES_VALIDAS = ["pdf", "xml"];

    return Controller.extend("com.ccb.viaticos.controller.CargaPC", {

        formatter: formatter,

        /**
         * Inicialización de la vista de carga de factura desde PC
         */
        onInit: function () {
            var oViewModel = new JSONModel({
                archivoSeleccionado: false,
                nombreArchivo: "",
                tamanoArchivo: "",
                errorFormato: false,
                errorTamano: false,
                subiendo: false,
                procesando: false,
                porcentajeCarga: 0,
                mensajeError: "",
                mostrarError: false
            });
            this.getView().setModel(oViewModel, "vm");

            this._oArchivo = null;

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
                archivoSeleccionado: false,
                nombreArchivo: "",
                tamanoArchivo: "",
                errorFormato: false,
                errorTamano: false,
                subiendo: false,
                procesando: false,
                porcentajeCarga: 0,
                mensajeError: "",
                mostrarError: false
            });
            this._oArchivo = null;
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
                    this._procesarArchivoSeleccionado(aArchivos[0]);
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
         * Manejador del control FileUploader cuando se selecciona un archivo
         */
        onArchivoSeleccionado: function (oEvent) {
            var oArchivo = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            if (oArchivo) {
                this._procesarArchivoSeleccionado(oArchivo);
            }
        },

        /**
         * Valida el formato (.pdf / .xml) y tamaño (máx. 10MB) del archivo
         * seleccionado y actualiza el estado de la vista
         * @param {File} oArchivo - archivo seleccionado por el usuario
         * @private
         */
        _procesarArchivoSeleccionado: function (oArchivo) {
            var oViewModel = this.getView().getModel("vm");
            var sExtension = oArchivo.name.split(".").pop().toLowerCase();

            oViewModel.setProperty("/errorFormato", false);
            oViewModel.setProperty("/errorTamano", false);
            oViewModel.setProperty("/mostrarError", false);

            if (EXTENSIONES_VALIDAS.indexOf(sExtension) === -1) {
                oViewModel.setProperty("/errorFormato", true);
                oViewModel.setProperty("/archivoSeleccionado", false);
                return;
            }

            if (oArchivo.size > TAMANO_MAXIMO_BYTES) {
                oViewModel.setProperty("/errorTamano", true);
                oViewModel.setProperty("/archivoSeleccionado", false);
                return;
            }

            this._oArchivo = oArchivo;
            oViewModel.setProperty("/archivoSeleccionado", true);
            oViewModel.setProperty("/nombreArchivo", oArchivo.name);
            oViewModel.setProperty("/tamanoArchivo", formatter.formatoTamanoArchivo(oArchivo.size));

            // Iniciar automáticamente la carga y procesamiento
            this._subirArchivo();
        },

        /**
         * Sube el archivo al backend (CPI) mostrando una barra de progreso
         * y luego inicia el polling del estado de OCR
         * Endpoint: POST /http/api/v1/facturas/cargar
         * @private
         */
        _subirArchivo: function () {
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();

            oViewModel.setProperty("/subiendo", true);
            oViewModel.setProperty("/porcentajeCarga", 0);

            var oFormData = new FormData();
            oFormData.append("archivo", this._oArchivo, this._oArchivo.name);
            oFormData.append("origen", "pc");

            oApiService.postFormData("/api/v1/facturas/cargar", oFormData, function (iPorcentaje) {
                oViewModel.setProperty("/porcentajeCarga", iPorcentaje);
            }.bind(this))
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/subiendo", false);
                    oViewModel.setProperty("/procesando", true);
                    oViewModel.setProperty("/porcentajeCarga", 0);

                    if (!oRespuesta || !oRespuesta.jobId) {
                        throw { message: "errorGenerico" };
                    }
                    return this._iniciarPollingOcr(oRespuesta.jobId);
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/subiendo", false);
                    oViewModel.setProperty("/procesando", false);
                    oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                    oViewModel.setProperty("/mostrarError", true);
                }.bind(this));
        },

        /**
         * Realiza polling al endpoint de estado del OCR hasta que el
         * procesamiento finalice y navega automáticamente a la Vista 5
         * Endpoint: GET /http/api/v1/facturas/ocr/{jobId}
         * @param {string} sJobId - identificador del job de OCR
         * @private
         */
        _iniciarPollingOcr: function (sJobId) {
            var oApiService = this.getOwnerComponent().getApiService();
            var oRouter = this.getOwnerComponent().getRouter();
            var oViewModel = this.getView().getModel("vm");
            var iProgreso = 0;

            return new Promise(function (resolve, reject) {
                var consultarEstado = function () {
                    oApiService.get("/api/v1/facturas/ocr/" + sJobId)
                        .then(function (oEstado) {
                            if (oEstado.status === "completado") {
                                oViewModel.setProperty("/porcentajeCarga", 100);
                                resolve(oEstado);
                                // Transición automática a la Vista 5 (Revisión de datos)
                                oRouter.navTo("RouteRevisionDatos", { jobId: sJobId });
                            } else if (oEstado.status === "error") {
                                reject({ message: "errorGenerico" });
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
