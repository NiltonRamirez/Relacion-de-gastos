sap.ui.define([
    "sap/ui/base/Object"
], function (BaseObject) {
    "use strict";

    /**
     * Servicio centralizado de llamadas HTTP hacia el backend SAP a través de SAP CPI.
     *
     * Todas las peticiones se enrutan al destino "dest_int_s" configurado en
     * xs-app.json bajo el prefijo "/http/", el mismo patrón de conectividad
     * utilizado por la app de gestión de cupos (fiori-quota-app).
     *
     * Endpoints expuestos por CPI (rutas relativas a /http/):
     *   POST /api/v1/auth/login
     *   POST /api/v1/auth/registro
     *   GET  /api/v1/usuarios/me
     *   POST /api/v1/facturas/capturar          (multipart/form-data - imagen de cámara)
     *   POST /api/v1/facturas/cargar             (multipart/form-data - PDF / XML)
     *   GET  /api/v1/facturas/ocr/{jobId}        (polling de estado OCR)
     *   POST /api/v1/dian/validar-nit            (validación NIT/CUFE ante DIAN)
     *   GET  /api/v1/topes-viaticos              (topes configurados por categoría)
     *   POST /api/v1/gastos/registrar            (registrar gasto definitivo)
     *   POST /api/v1/gastos/borrador             (guardar borrador)
     *   GET  /api/v1/gastos                      (lista de gastos con filtros)
     *   GET  /api/v1/gastos/{id}                 (detalle de un gasto)
     *   GET  /api/v1/gastos/{id}/factura         (descarga del archivo de factura)
     *   GET  /api/v1/gastos/resumen              (resumen mensual para el dashboard)
     *   GET  /api/v1/gastos/pendientes           (gastos pendientes de aprobación - analista)
     *   POST /api/v1/gastos/{id}/aprobar         (aprobar gasto - analista)
     *   POST /api/v1/gastos/{id}/rechazar        (rechazar gasto - analista)
     */
    return BaseObject.extend("com.ccb.viaticos.service.ApiService", {

        constructor: function (oAuthService) {
            // sap.ui.require.toUrl incluye el prefijo del HTML5 repo automáticamente en Work Zone
            this._sBaseUrl = sap.ui.require.toUrl("com/ccb/viaticos") + "/http";
            this._oAuthService = oAuthService;
            this._sCsrfToken = null;
        },

        /**
         * Indica si el navegador tiene conexión a internet
         * @returns {boolean} true si hay conexión
         */
        estaEnLinea: function () {
            return navigator.onLine;
        },

        /**
         * Construye los headers comunes de autenticación (token JWT en sessionStorage)
         * @param {boolean} bConToken - si debe incluir el header Authorization
         * @returns {object} headers HTTP
         * @private
         */
        _construirHeaders: function (bConToken) {
            var oHeaders = {
                "Content-Type": "application/json"
            };
            if (bConToken !== false && this._oAuthService) {
                var sToken = this._oAuthService.getToken();
                if (sToken) {
                    oHeaders["Authorization"] = "Bearer " + sToken;
                }
            }
            return oHeaders;
        },

        /**
         * Obtiene el token CSRF necesario para peticiones de escritura (POST/PUT/DELETE)
         * @returns {Promise<string|null>} token CSRF o null
         * @private
         */
        _obtenerCsrfToken: function () {
            if (this._sCsrfToken) {
                return Promise.resolve(this._sCsrfToken);
            }
            return fetch(this._sBaseUrl + "/api/v1/usuarios/me", {
                method: "GET",
                headers: Object.assign(this._construirHeaders(true), { "X-CSRF-Token": "Fetch" })
            }).then(function (oRespuesta) {
                var sToken = oRespuesta.headers.get("X-CSRF-Token");
                this._sCsrfToken = sToken || null;
                return this._sCsrfToken;
            }.bind(this)).catch(function () {
                return null;
            });
        },

        /**
         * Realiza una petición GET
         * @param {string} sRuta - ruta relativa (ej. "/api/v1/gastos")
         * @param {object} [oOpciones] - { conToken: boolean }
         * @returns {Promise<object>} respuesta JSON
         */
        get: function (sRuta, oOpciones) {
            oOpciones = oOpciones || {};
            return fetch(this._sBaseUrl + sRuta, {
                method: "GET",
                headers: this._construirHeaders(oOpciones.conToken)
            }).then(this._procesarRespuesta.bind(this));
        },

        /**
         * Realiza una petición POST con cuerpo JSON
         * @param {string} sRuta - ruta relativa
         * @param {object} oCuerpo - cuerpo de la petición
         * @param {object} [oOpciones] - { conToken: boolean }
         * @returns {Promise<object>} respuesta JSON
         */
        post: function (sRuta, oCuerpo, oOpciones) {
            oOpciones = oOpciones || {};
            return this._obtenerCsrfToken().then(function (sCsrf) {
                var oHeaders = this._construirHeaders(oOpciones.conToken);
                if (sCsrf) {
                    oHeaders["X-CSRF-Token"] = sCsrf;
                }
                return fetch(this._sBaseUrl + sRuta, {
                    method: "POST",
                    headers: oHeaders,
                    body: JSON.stringify(oCuerpo)
                }).then(this._procesarRespuesta.bind(this));
            }.bind(this));
        },

        /**
         * Realiza una petición POST con un FormData (carga de archivos / imágenes)
         * No establece Content-Type para que el navegador defina el boundary multipart
         * @param {string} sRuta - ruta relativa
         * @param {FormData} oFormData - datos del formulario (archivo)
         * @param {function} [fnProgreso] - callback(porcentaje) para progreso de carga
         * @returns {Promise<object>} respuesta JSON
         */
        postFormData: function (sRuta, oFormData, fnProgreso) {
            return this._obtenerCsrfToken().then(function (sCsrf) {
                return new Promise(function (resolve, reject) {
                    var oXhr = new XMLHttpRequest();
                    oXhr.open("POST", this._sBaseUrl + sRuta, true);

                    if (this._oAuthService) {
                        var sToken = this._oAuthService.getToken();
                        if (sToken) {
                            oXhr.setRequestHeader("Authorization", "Bearer " + sToken);
                        }
                    }
                    if (sCsrf) {
                        oXhr.setRequestHeader("X-CSRF-Token", sCsrf);
                    }

                    if (fnProgreso) {
                        oXhr.upload.onprogress = function (oEvento) {
                            if (oEvento.lengthComputable) {
                                var iPorcentaje = Math.round((oEvento.loaded / oEvento.total) * 100);
                                fnProgreso(iPorcentaje);
                            }
                        };
                    }

                    oXhr.onload = function () {
                        var oData;
                        try {
                            oData = JSON.parse(oXhr.responseText);
                        } catch (e) {
                            oData = null;
                        }
                        if (oXhr.status >= 200 && oXhr.status < 300) {
                            resolve(oData);
                        } else {
                            reject({
                                status: oXhr.status,
                                message: (oData && oData.mensaje) || "Error al procesar el archivo"
                            });
                        }
                    };

                    oXhr.onerror = function () {
                        reject({ status: 0, message: "Error de conexión con el servidor" });
                    };

                    oXhr.send(oFormData);
                }.bind(this));
            }.bind(this));
        },

        /**
         * Descarga un archivo binario (factura) como Blob
         * @param {string} sRuta - ruta relativa del archivo
         * @returns {Promise<Blob>} contenido binario del archivo
         */
        descargarArchivo: function (sRuta) {
            return fetch(this._sBaseUrl + sRuta, {
                method: "GET",
                headers: this._construirHeaders(true)
            }).then(function (oRespuesta) {
                if (!oRespuesta.ok) {
                    return Promise.reject({ status: oRespuesta.status, message: "No fue posible descargar el archivo" });
                }
                return oRespuesta.blob();
            });
        },

        /**
         * Procesa la respuesta HTTP, parseando JSON y normalizando errores
         * @param {Response} oRespuesta - respuesta fetch
         * @returns {Promise<object>} cuerpo JSON de la respuesta
         * @private
         */
        _procesarRespuesta: function (oRespuesta) {
            if (oRespuesta.status === 401) {
                return Promise.reject({ status: 401, message: "errorSesionExpirada" });
            }
            return oRespuesta.text().then(function (sTexto) {
                var oData = {};
                try {
                    oData = sTexto ? JSON.parse(sTexto) : {};
                } catch (e) {
                    return Promise.reject({ status: oRespuesta.status, message: "Error al interpretar la respuesta del servidor" });
                }
                if (!oRespuesta.ok) {
                    return Promise.reject({
                        status: oRespuesta.status,
                        message: oData.mensaje || oData.message || "Error en la solicitud"
                    });
                }
                return oData;
            });
        }
    });
});
