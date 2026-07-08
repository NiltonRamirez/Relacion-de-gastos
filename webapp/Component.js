sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel",
    "com/ccb/viaticos/service/ApiService",
    "com/ccb/viaticos/model/GastoModel"
], function (UIComponent, Device, JSONModel, ApiService, GastoModel) {
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
         * Obtiene la información del usuario autenticado desde el backend
         * (la sesión ya viene establecida por IAS a través del approuter)
         * Endpoint: GET /http/api/v1/usuarios/me
         * @private
         */
        _cargarUsuarioActual: function () {
            var oAppModel = this.getModel("app");
            this._oApiService.get("/api/v1/usuarios/me")
                .then(function (oUsuario) {
                    oAppModel.setProperty("/usuario", oUsuario);
                    oAppModel.setProperty("/esAnalista", !!oUsuario && oUsuario.rol === "analista");
                })
                .catch(function () {
                    // Si falla la consulta se mantiene el estado por defecto
                    // (sin datos de usuario y sin rol de analista)
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
