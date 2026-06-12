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
                imagenCapturada: false,
                calidadBuena: false,
                procesando: false,
                errorCamara: false,
                mensajeError: "",
                mostrarError: false,
                htmlPreview: "",
                porcentajeCarga: 0
            });
            this.getView().setModel(oViewModel, "vm");

            this._oStream = null;
            this._sImagenBase64 = null;

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteCapturaMobil").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Al ingresar a la vista se inicia la cámara del dispositivo
         * @private
         */
        _onRoutePatternMatched: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setProperty("/imagenCapturada", false);
            oViewModel.setProperty("/procesando", false);
            oViewModel.setProperty("/mostrarError", false);
            oViewModel.setProperty("/errorCamara", false);

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

            oViewModel.setProperty("/imagenCapturada", true);
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
            oViewModel.setProperty("/imagenCapturada", false);
            oViewModel.setProperty("/htmlPreview", "");
            this._iniciarCamara();
        },

        /**
         * Confirma el uso de la imagen capturada: la envía al backend (CPI)
         * para iniciar el proceso de OCR y comienza el polling de estado
         */
        onUsarImagen: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setProperty("/procesando", true);
            oViewModel.setProperty("/mostrarError", false);

            var oApiService = this.getOwnerComponent().getApiService();

            // Convertir el dataURL (base64) en un Blob para enviarlo como multipart/form-data
            fetch(this._sImagenBase64)
                .then(function (oRespuesta) {
                    return oRespuesta.blob();
                })
                .then(function (oBlob) {
                    var oFormData = new FormData();
                    oFormData.append("archivo", oBlob, "factura_" + Date.now() + ".jpg");
                    oFormData.append("origen", "camara");

                    // Endpoint: POST /http/api/v1/facturas/capturar
                    return oApiService.postFormData("/api/v1/facturas/capturar", oFormData);
                })
                .then(function (oRespuesta) {
                    if (!oRespuesta || !oRespuesta.jobId) {
                        throw { message: "errorGenerico" };
                    }
                    return this._iniciarPollingOcr(oRespuesta.jobId);
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/procesando", false);
                    oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                    oViewModel.setProperty("/mostrarError", true);
                }.bind(this));
        },

        /**
         * Inicia el polling periódico al endpoint de estado de OCR hasta
         * que el procesamiento finalice (status = "completado")
         * Endpoint: GET /http/api/v1/facturas/ocr/{jobId}
         * @param {string} sJobId - identificador del job de OCR
         * @returns {Promise} promesa que se resuelve al completar el OCR
         * @private
         */
        _iniciarPollingOcr: function (sJobId) {
            var oApiService = this.getOwnerComponent().getApiService();
            var oRouter = this.getOwnerComponent().getRouter();

            return new Promise(function (resolve, reject) {
                var consultarEstado = function () {
                    oApiService.get("/api/v1/facturas/ocr/" + sJobId)
                        .then(function (oEstado) {
                            if (oEstado.status === "completado") {
                                resolve(oEstado);
                                // Transición automática a la Vista 5 (Revisión de datos)
                                oRouter.navTo("RouteRevisionDatos", { jobId: sJobId });
                            } else if (oEstado.status === "error") {
                                reject({ message: "errorGenerico" });
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
