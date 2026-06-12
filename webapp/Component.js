sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel",
    "com/ccb/viaticos/service/ApiService",
    "com/ccb/viaticos/service/AuthService",
    "com/ccb/viaticos/model/GastoModel"
], function (UIComponent, Device, JSONModel, ApiService, AuthService, GastoModel) {
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

            // Servicios centralizados: autenticación y llamadas a CPI
            this._oAuthService = new AuthService();
            this._oApiService = new ApiService(this._oAuthService);

            // Modelo "app": estado global de la aplicación (sesión, dashboard, etc.)
            var oAppModel = new JSONModel({
                usuario: this._oAuthService.getUsuario(),
                autenticado: this._oAuthService.estaAutenticado(),
                enLinea: navigator.onLine,
                resumenMes: {
                    totalGastado: 0,
                    numeroGastos: 0,
                    pendientesAprobacion: 0
                }
            });
            this.setModel(oAppModel, "app");

            // Modelo "gasto": estructura del gasto en proceso de captura/revisión
            this.setModel(new JSONModel(GastoModel.crearGastoVacio()), "gasto");

            // Modelo "" (default): listas, filtros y datos generales de vistas
            this.setModel(new JSONModel({}));

            // Escuchar cambios de conectividad para sincronización offline
            this._registrarEventosConectividad();

            // Inicializar el enrutador
            this.getRouter().initialize();
        },

        /**
         * Devuelve la instancia del servicio de llamadas a CPI
         * @returns {com.ccb.viaticos.service.ApiService} servicio de API
         */
        getApiService: function () {
            return this._oApiService;
        },

        /**
         * Devuelve la instancia del servicio de autenticación
         * @returns {com.ccb.viaticos.service.AuthService} servicio de autenticación
         */
        getAuthService: function () {
            return this._oAuthService;
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
