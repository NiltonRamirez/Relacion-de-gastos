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
            this.getView().setModel(new JSONModel({ gastos: [] }), "vm");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteConfirmacion").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Carga el resumen del lote de gastos recién registrados (almacenado en
         * el modelo "" por la Vista 5) y los números de transacción de la ruta
         * @private
         */
        _onRoutePatternMatched: function (oEvent) {
            var sTransaccionIds = oEvent.getParameter("arguments").transaccionIds;
            var oModel = this.getOwnerComponent().getModel();
            var aGastos = oModel.getProperty("/gastosRegistrados") || [];

            if (!aGastos.length && sTransaccionIds) {
                aGastos = sTransaccionIds.split(",").map(function (sTransaccionId) {
                    return { numeroTransaccion: sTransaccionId };
                });
            }

            this.getView().getModel("vm").setProperty("/gastos", aGastos);
        },

        /**
         * Inicia el registro de un nuevo lote de gastos: reinicia el modelo "gasto"
         * y navega a la selección de método de captura
         */
        onRegistrarOtro: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            oGastoModel.setData(GastoModel.crearLoteVacio());

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
