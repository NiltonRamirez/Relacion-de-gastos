sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "com/ccb/viaticos/service/ApiService",
    "com/ccb/viaticos/model/GastoModel"
], function (UIComponent, Device, JSONModel, MessageBox, ApiService, GastoModel) {
    "use strict";

    return UIComponent.extend("com.ccb.viaticos.Component", {
        metadata: {
            manifest: "json"
        },

        /**
         * Inicialización del componente raíz de la aplicación.
         * Configura modelos globales, servicios centralizados y el router.
         */
        init: function () {
            // Llamar a la inicialización del componente base
            UIComponent.prototype.init.apply(this, arguments);

            // Modelo del dispositivo (para responsive: phone/tablet/desktop)
            this.setModel(new JSONModel(Device), "device");

            // Servicio centralizado de llamadas a CPI.
            // La autenticación la realiza IAS de forma externa (approuter),
            // por lo que la app no maneja credenciales ni tokens propios.
            this._oApiService = new ApiService();

            // Modelo "app": estado global de la aplicación (usuario, dashboard, etc.)
            var oAppModel = new JSONModel({
                usuario: null,
                esAnalista: false,
                enLinea: navigator.onLine,
                resumenMes: {
                    totalGastado: 0,
                    numeroGastos: 0,
                    pendientesAprobacion: 0
                }
            });
            this.setModel(oAppModel, "app");

            // Modelo "gasto": lote de facturas en proceso de captura/revisión
            this.setModel(new JSONModel(GastoModel.crearLoteVacio()), "gasto");

            // Modelo "" (default): listas, filtros y datos generales de vistas
            this.setModel(new JSONModel({}));

            // Escuchar cambios de conectividad para sincronización offline
            this._registrarEventosConectividad();

            // Cargar los datos del usuario autenticado por IAS
            this._cargarUsuarioActual();

            // Inicializar el enrutador
            this.getRouter().initialize();
        },

        /**
         * Identifica al usuario logueado en el launchpad de Work Zone (IAS)
         * y consulta sus datos de colaborador en el backend.
         * Endpoint: GET /http/api/v1/users/by-email?email=...
         * Respuesta: { status: "success", data: { employeeId, email,
         *              nombreCompleto?, rol?, sourceSystem } }
         *
         * El nombre y el correo se toman del launchpad (siempre disponibles
         * con IAS); el backend aporta employeeId, sourceSystem y el rol.
         * Si el backend además envía nombreCompleto, ese tiene prioridad.
         * @private
         */
        _cargarUsuarioActual: function () {
            var oAppModel = this.getModel("app");

            this._obtenerUsuarioLaunchpad()
                .then(function (oUsuarioShell) {
                    if (!oUsuarioShell || !oUsuarioShell.email) {
                        // Fuera del launchpad (ej. preview standalone) no hay
                        // shell de Work Zone; se omite la identificación
                        return null;
                    }

                    // Publicar de inmediato el nombre/correo del launchpad para
                    // que el saludo del Dashboard no dependa del backend
                    oAppModel.setProperty("/usuario", oUsuarioShell);

                    this._oApiService.setEmailUsuario(oUsuarioShell.email);

                    return this._oApiService.get("/api/v1/users/by-email?email=" + encodeURIComponent(oUsuarioShell.email))
                        .then(function (oRespuesta) {
                            var oDatos = (oRespuesta && oRespuesta.data) || {};

                            // Combinar: datos del backend sobre los del launchpad
                            var oUsuario = Object.assign({}, oUsuarioShell, oDatos);
                            if (!oUsuario.nombreCompleto) {
                                oUsuario.nombreCompleto = oUsuarioShell.nombreCompleto || oUsuario.email;
                            }

                            oAppModel.setProperty("/usuario", oUsuario);
                            oAppModel.setProperty("/esAnalista", this._esRolAnalista(oUsuario.rol));
                        }.bind(this));
                }.bind(this))
                .catch(function (oError) {
                    // 401: el usuario no existe en la base de colaboradores activos.
                    // Se muestra el mensaje devuelto por el backend (error.message.value)
                    oAppModel.setProperty("/esAnalista", false);
                    if (oError && oError.message) {
                        MessageBox.error(oError.message);
                    }
                });
        },

        /**
         * Determina si el rol recibido corresponde al analista financiero.
         * Tolera variaciones de escritura ("analista", "ANALISTA",
         * "Analista Financiero", etc.)
         * @param {string} sRol - rol devuelto por el backend
         * @returns {boolean} true si es un rol de analista
         * @private
         */
        _esRolAnalista: function (sRol) {
            return !!sRol && sRol.toLowerCase().indexOf("analista") !== -1;
        },

        /**
         * Obtiene el correo y el nombre completo del usuario autenticado en el
         * launchpad mediante el servicio estándar "UserInfo" de la shell (sap.ushell)
         * @returns {Promise<object|null>} { email, nombreCompleto } o null si la
         *          app no corre dentro de un launchpad
         * @private
         */
        _obtenerUsuarioLaunchpad: function () {
            return new Promise(function (resolve) {
                sap.ui.require(["sap/ushell/Container"], function (Container) {
                    Container.getServiceAsync("UserInfo")
                        .then(function (oUserInfo) {
                            resolve({
                                email: oUserInfo.getEmail() || null,
                                nombreCompleto: oUserInfo.getFullName() || oUserInfo.getEmail() || ""
                            });
                        })
                        .catch(function () {
                            resolve(null);
                        });
                }, function () {
                    // La librería sap.ushell no está disponible (modo standalone)
                    resolve(null);
                });
            });
        },

        /**
         * Devuelve la instancia del servicio de llamadas a CPI
         * @returns {com.ccb.viaticos.service.ApiService} servicio de API
         */
        getApiService: function () {
            return this._oApiService;
        },

        /**
         * Determina la clase de densidad de contenido según el dispositivo:
         * compacto para escritorio (mouse) y cozy para dispositivos táctiles
         * @returns {string} clase CSS de densidad ("sapUiSizeCompact" | "sapUiSizeCozy")
         */
        getContentDensityClass: function () {
            if (this._sContentDensityClass === undefined) {
                this._sContentDensityClass = Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
            }
            return this._sContentDensityClass;
        },

        /**
         * Registra listeners de "online"/"offline" para reflejar el estado
         * de conectividad en el modelo "app" y disparar sincronización
         * @private
         */
        _registrarEventosConectividad: function () {
            var oAppModel = this.getModel("app");
            window.addEventListener("online", function () {
                oAppModel.setProperty("/enLinea", true);
            });
            window.addEventListener("offline", function () {
                oAppModel.setProperty("/enLinea", false);
            });
        }
    });
});
