sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    // Intervalo de polling para consultar el estado del OCR (en milisegundos)
    var INTERVALO_POLLING_MS = 2000;
    // Umbral mínimo de nitidez para considerar una imagen "legible"
    var UMBRAL_CALIDAD = 35;

    return Controller.extend("com.ccb.viaticos.controller.CapturaMobil", {

        /**
         * Inicialización de la vista de captura con cámara.
         */
        onInit: function () {
            var oViewModel = new JSONModel({
                // estado: "camara" | "previsualizacion" | "galeria" | "procesando"
                estado: "camara",
                calidadBuena: false,
                errorCamara: false,
                mensajeError: "",
                mostrarError: false,
                htmlPreview: "",
                facturas: []
            });
            this.getView().setModel(oViewModel, "vm");

            this._oStream = null;
            this._sImagenBase64 = null;

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteCapturaMobil").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Al ingresar a la vista se reinicia el estado y se inicia la cámara del dispositivo
         * @private
         */
        _onRoutePatternMatched: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setProperty("/estado", "camara");
            oViewModel.setProperty("/mostrarError", false);
            oViewModel.setProperty("/errorCamara", false);
            oViewModel.setProperty("/facturas", []);

            this._iniciarCamara();
        },

        /**
         * Activa el componente de cámara del dispositivo usando getUserMedia
         * y lo asocia al elemento <video> de la vista
         * @private
         */
        _iniciarCamara: function () {
            var oViewModel = this.getView().getModel("vm");

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                oViewModel.setProperty("/errorCamara", true);
                return;
            }

            navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false
            }).then(function (oStream) {
                this._oStream = oStream;
                var oVideo = document.getElementById("videoCamara");
                if (oVideo) {
                    oVideo.srcObject = oStream;
                }
            }.bind(this)).catch(function () {
                oViewModel.setProperty("/errorCamara", true);
            });
        },

        /**
         * Detiene el stream de la cámara para liberar el dispositivo
         * @private
         */
        _detenerCamara: function () {
            if (this._oStream) {
                this._oStream.getTracks().forEach(function (oTrack) {
                    oTrack.stop();
                });
                this._oStream = null;
            }
        },

        /**
         * Captura un fotograma del video actual hacia un canvas,
         * evalúa la calidad de la imagen y la muestra como vista previa
         */
        onCapturarFoto: function () {
            var oViewModel = this.getView().getModel("vm");
            var oVideo = document.getElementById("videoCamara");

            if (!oVideo || !oVideo.videoWidth) {
                oViewModel.setProperty("/errorCamara", true);
                return;
            }

            var oCanvas = document.createElement("canvas");
            oCanvas.width = oVideo.videoWidth;
            oCanvas.height = oVideo.videoHeight;
            var oContexto = oCanvas.getContext("2d");
            oContexto.drawImage(oVideo, 0, 0, oCanvas.width, oCanvas.height);

            // Evaluar calidad de imagen (nitidez aproximada por varianza de luminancia)
            var fCalidad = this._evaluarCalidadImagen(oContexto, oCanvas.width, oCanvas.height);
            var bCalidadBuena = fCalidad >= UMBRAL_CALIDAD;

            this._sImagenBase64 = oCanvas.toDataURL("image/jpeg", 0.85);

            this._detenerCamara();

            oViewModel.setProperty("/estado", "previsualizacion");
            oViewModel.setProperty("/calidadBuena", bCalidadBuena);
            oViewModel.setProperty("/htmlPreview", "<img class='camaraPreview' src='" + this._sImagenBase64 + "' />");
        },

        /**
         * Calcula un puntaje de calidad/nitidez aproximado de la imagen capturada
         * mediante la varianza de luminancia entre píxeles adyacentes.
         * @param {CanvasRenderingContext2D} oContexto - contexto del canvas
         * @param {number} iAncho - ancho de la imagen
         * @param {number} iAlto - alto de la imagen
         * @returns {number} puntaje de nitidez
         * @private
         */
        _evaluarCalidadImagen: function (oContexto, iAncho, iAlto) {
            var oImageData = oContexto.getImageData(0, 0, iAncho, iAlto);
            var aPixeles = oImageData.data;
            var fSumaDiferencias = 0;
            var iMuestras = 0;

            // Muestreo cada 10 píxeles para mantener el cálculo liviano
            for (var i = 0; i < aPixeles.length - 40; i += 40) {
                var fLuminanciaActual = (aPixeles[i] + aPixeles[i + 1] + aPixeles[i + 2]) / 3;
                var fLuminanciaSiguiente = (aPixeles[i + 4] + aPixeles[i + 5] + aPixeles[i + 6]) / 3;
                fSumaDiferencias += Math.abs(fLuminanciaActual - fLuminanciaSiguiente);
                iMuestras++;
            }

            return iMuestras > 0 ? (fSumaDiferencias / iMuestras) : 0;
        },

        /**
         * Reinicia la captura: descarta la imagen actual y vuelve a activar la cámara
         */
        onReintentar: function () {
            var oViewModel = this.getView().getModel("vm");
            this._sImagenBase64 = null;
            oViewModel.setProperty("/estado", "camara");
            oViewModel.setProperty("/htmlPreview", "");
            this._iniciarCamara();
        },

        /**
         * Cancela la captura en curso (sin descartar las facturas ya agregadas)
         * y vuelve a la galería
         */
        onCancelarCaptura: function () {
            var oViewModel = this.getView().getModel("vm");
            this._sImagenBase64 = null;
            oViewModel.setProperty("/htmlPreview", "");
            oViewModel.setProperty("/estado", "galeria");
        },

        /**
         * Confirma el uso de la imagen capturada: la agrega a la galería de
         * facturas pendientes de envío
         */
        onUsarImagen: function () {
            var oViewModel = this.getView().getModel("vm");
            var aFacturas = oViewModel.getProperty("/facturas");

            aFacturas.push({
                sBase64: this._sImagenBase64,
                nombreArchivo: "factura_" + (aFacturas.length + 1) + ".jpg",
                htmlThumbnail: "<img class='galeriaThumbnail' src='" + this._sImagenBase64 + "' />"
            });

            oViewModel.setProperty("/facturas", aFacturas);
            this._sImagenBase64 = null;
            oViewModel.setProperty("/htmlPreview", "");
            oViewModel.setProperty("/estado", "galeria");
        },

        /**
         * Permite capturar una factura adicional: vuelve a activar la cámara
         */
        onAgregarOtra: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setProperty("/estado", "camara");
            oViewModel.setProperty("/errorCamara", false);
            this._iniciarCamara();
        },

        /**
         * Elimina una factura capturada de la galería
         * @param {sap.ui.base.Event} oEvento - evento de presión del botón eliminar
         */
        onEliminarFactura: function (oEvento) {
            var oViewModel = this.getView().getModel("vm");
            var oContexto = oEvento.getSource().getBindingContext("vm");
            var iIndice = parseInt(oContexto.getPath().split("/").pop(), 10);

            var aFacturas = oViewModel.getProperty("/facturas");
            aFacturas.splice(iIndice, 1);
            oViewModel.setProperty("/facturas", aFacturas);
        },

        /**
         * Envía todas las facturas capturadas al backend (CPI) para iniciar
         * el OCR del lote y comienza el polling de estado del lote
         */
        onContinuarLote: function () {
            var oViewModel = this.getView().getModel("vm");
            var aFacturas = oViewModel.getProperty("/facturas");

            if (!aFacturas.length) {
                return;
            }

            oViewModel.setProperty("/estado", "procesando");
            oViewModel.setProperty("/mostrarError", false);

            var oApiService = this.getOwnerComponent().getApiService();

            // Convertir cada imagen (dataURL/base64) en un Blob para enviarlas como multipart/form-data
            Promise.all(aFacturas.map(function (oFactura) {
                return fetch(oFactura.sBase64).then(function (oRespuesta) {
                    return oRespuesta.blob();
                });
            })).then(function (aBlobs) {
                var oFormData = new FormData();
                aBlobs.forEach(function (oBlob, iIndice) {
                    oFormData.append("archivos", oBlob, aFacturas[iIndice].nombreArchivo);
                });
                oFormData.append("origen", "camara");

                // Endpoint: POST /http/api/v1/facturas/capturar (respuesta: { jobs: [...] })
                return oApiService.postFormData("/api/v1/facturas/capturar", oFormData);
            }).then(function (oRespuesta) {
                if (!oRespuesta || !oRespuesta.jobs || !oRespuesta.jobs.length) {
                    throw { message: "errorGenerico" };
                }
                var aJobIds = oRespuesta.jobs.map(function (oJob) {
                    return oJob.jobId;
                });
                return this._iniciarPollingOcrLote(aJobIds);
            }.bind(this)).catch(function (oError) {
                oViewModel.setProperty("/estado", "galeria");
                oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                oViewModel.setProperty("/mostrarError", true);
            }.bind(this));
        },

        /**
         * Inicia el polling periódico al endpoint de estado de OCR del lote hasta
         * que todos los documentos finalicen su procesamiento (status = "completado")
         * Endpoint: GET /http/api/v1/facturas/ocr/lote?jobIds=...
         * @param {Array<string>} aJobIds - identificadores de los jobs de OCR
         * @returns {Promise} promesa que se resuelve al completar el OCR de todo el lote
         * @private
         */
        _iniciarPollingOcrLote: function (aJobIds) {
            var oApiService = this.getOwnerComponent().getApiService();
            var oRouter = this.getOwnerComponent().getRouter();
            var sJobIds = aJobIds.join(",");

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
                                resolve(aResultados);
                                // Transición automática a la Vista 5 (Revisión de datos)
                                oRouter.navTo("RouteRevisionDatos", { jobIds: sJobIds });
                            } else {
                                setTimeout(consultarEstado, INTERVALO_POLLING_MS);
                            }
                        })
                        .catch(reject);
                };
                consultarEstado();
            });
        },

        /**
         * Navega a la Vista 4 (carga de archivo desde PC) como alternativa a la cámara
         */
        onUsarArchivo: function () {
            this._detenerCamara();
            this.getOwnerComponent().getRouter().navTo("RouteCargaPC");
        },

        /**
         * Vuelve al dashboard liberando la cámara
         */
        onVolver: function () {
            this._detenerCamara();
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
