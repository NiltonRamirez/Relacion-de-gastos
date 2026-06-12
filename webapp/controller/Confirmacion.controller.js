sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/ccb/viaticos/model/formatter",
    "com/ccb/viaticos/model/GastoModel"
], function (Controller, JSONModel, formatter, GastoModel) {
    "use strict";

    return Controller.extend("com.ccb.viaticos.controller.Confirmacion", {

        formatter: formatter,

        /**
         * Inicialización de la vista de confirmación de registro
         */
        onInit: function () {
            this.getView().setModel(new JSONModel({}), "vm");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteConfirmacion").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Carga el resumen del gasto recién registrado (almacenado en el
         * modelo "" por la Vista 5) y el número de transacción de la ruta
         * @private
         */
        _onRoutePatternMatched: function (oEvent) {
            var sTransaccionId = oEvent.getParameter("arguments").transaccionId;
            var oModel = this.getOwnerComponent().getModel();
            var oResumen = oModel.getProperty("/ultimoGastoRegistrado") || {};

            this.getView().getModel("vm").setData({
                numeroTransaccion: sTransaccionId || oResumen.numeroTransaccion,
                proveedor: oResumen.proveedor,
                categoria: oResumen.categoria,
                total: oResumen.total,
                fecha: oResumen.fecha
            });
        },

        /**
         * Inicia el registro de un nuevo gasto: reinicia el modelo "gasto"
         * y navega a la selección de método de captura
         */
        onRegistrarOtro: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            oGastoModel.setData(GastoModel.crearGastoVacio());

            var oRouter = this.getOwnerComponent().getRouter();
            var oDevice = this.getOwnerComponent().getModel("device");
            var bEsMovil = oDevice.getProperty("/system/phone") || oDevice.getProperty("/system/tablet");

            if (bEsMovil) {
                oRouter.navTo("RouteCapturaMobil");
            } else {
                oRouter.navTo("RouteCargaPC");
            }
        },

        /**
         * Navega a la lista de gastos del usuario
         */
        onVerMisGastos: function () {
            this.getOwnerComponent().getRouter().navTo("RouteListaGastos");
        }
    });
});
