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
     * La autenticación la realiza IAS de forma externa (approuter), por lo
     * que las peticiones viajan con la sesión establecida por la plataforma
     * y este servicio no maneja tokens propios.
     *
     * Endpoints expuestos por CPI (rutas relativas a /http/):
     *   GET  /api/v1/users/by-email?email=...      (datos del colaborador según el correo
     *                                              del usuario logueado en el launchpad;
     *                                              respuesta { status, data: { employeeId,
     *                                              email, nombreCompleto?, rol?,
     *                                              sourceSystem } })
     *   POST /api/v1/facturas/capturar           (multipart/form-data - una o varias imágenes de cámara,
     *                                              campo "archivos" repetido; respuesta: arreglo "jobs")
     *   POST /api/v1/facturas/cargar              (multipart/form-data - uno o varios PDF / XML,
     *                                              campo "archivos" repetido; respuesta: arreglo "jobs")
     *   GET  /api/v1/facturas/ocr/lote?jobIds=... (polling de estado OCR para un lote de jobIds;
     *                                              respuesta: arreglo "resultados")
     *   POST /api/v1/dian/validar-nit             (validación NIT/CUFE ante DIAN)
     *   GET  /api/v1/topes-viaticos               (topes configurados por categoría)
     *   POST /api/v1/gastos/registrar             (registrar un lote de gastos; body { gastos: [...] },
     *                                              respuesta { transacciones: [...] })
     *   POST /api/v1/gastos/borrador              (guardar un lote de borradores; body { gastos: [...] })
     *   GET  /api/v1/gastos                       (lista de gastos con filtros)
     *   GET  /api/v1/gastos/{id}                  (detalle de un gasto)
     *   GET  /api/v1/gastos/{id}/factura          (descarga del archivo de factura)
     *   GET  /api/v1/gastos/resumen               (resumen mensual para el dashboard)
     *   GET  /api/v1/gastos/pendientes            (gastos pendientes de aprobación - analista)
     *   POST /api/v1/gastos/{id}/aprobar          (aprobar gasto - analista)
     *   POST /api/v1/gastos/{id}/rechazar         (rechazar gasto - analista)
     */
    return BaseObject.extend("com.ccb.viaticos.service.ApiService", {

        constructor: function () {
            // sap.ui.require.toUrl incluye el prefijo del HTML5 repo automáticamente en Work Zone
            this._sBaseUrl = sap.ui.require.toUrl("com/ccb/viaticos") + "/http";
            this._sCsrfToken = null;
            this._sEmailUsuario = null;
        },

        /**
         * Registra el correo del usuario logueado en el launchpad; se usa
         * para la obtención del token CSRF contra el endpoint de usuario
         * @param {string} sEmail - correo del usuario autenticado por IAS
         */
        setEmailUsuario: function (sEmail) {
            this._sEmailUsuario = sEmail;
        },

        /**
         * Indica si el navegador tiene conexión a internet
         * @returns {boolean} true si hay conexión
         */
        estaEnLinea: function () {
            return navigator.onLine;
        },

        /**
         * Construye los headers comunes de las peticiones JSON
         * @returns {object} headers HTTP
         * @private
         */
        _construirHeaders: function () {
            return {
                "Content-Type": "application/json"
            };
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
            var sRuta = "/api/v1/users/by-email" +
                (this._sEmailUsuario ? "?email=" + encodeURIComponent(this._sEmailUsuario) : "");
            return fetch(this._sBaseUrl + sRuta, {
                method: "GET",
                headers: Object.assign(this._construirHeaders(), { "X-CSRF-Token": "Fetch" })
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
         * @returns {Promise<object>} respuesta JSON
         */
        get: function (sRuta) {
            return fetch(this._sBaseUrl + sRuta, {
                method: "GET",
                headers: this._construirHeaders()
            }).then(this._procesarRespuesta.bind(this));
        },

        /**
         * Realiza una petición POST con cuerpo JSON
         * @param {string} sRuta - ruta relativa
         * @param {object} oCuerpo - cuerpo de la petición
         * @returns {Promise<object>} respuesta JSON
         */
        post: function (sRuta, oCuerpo) {
            return this._obtenerCsrfToken().then(function (sCsrf) {
                var oHeaders = this._construirHeaders();
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
                headers: this._construirHeaders()
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
                        message: this._extraerMensajeError(oData),
                        detalles: this._extraerDetallesError(oData)
                    });
                }
                return oData;
            }.bind(this));
        },

        /**
         * Extrae el mensaje de error de la respuesta, soportando tanto el
         * formato OData ({ error: { message: { value } } }) como el formato
         * plano ({ mensaje } / { message })
         * @param {object} oData - cuerpo de la respuesta de error
         * @returns {string} mensaje legible para el usuario
         * @private
         */
        _extraerMensajeError: function (oData) {
            if (oData && oData.error && oData.error.message) {
                return oData.error.message.value || oData.error.message;
            }
            return (oData && (oData.mensaje || oData.message)) || "Error en la solicitud";
        },

        /**
         * Extrae los detalles del error del formato OData
         * ({ error: { innererror: { errordetails: [...] } } })
         * @param {object} oData - cuerpo de la respuesta de error
         * @returns {Array<object>} detalles del error (puede ser vacío)
         * @private
         */
        _extraerDetallesError: function (oData) {
            return (oData && oData.error && oData.error.innererror &&
                oData.error.innererror.errordetails) || [];
        }
    });
});
