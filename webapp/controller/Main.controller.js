sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/ActionSheet",
    "sap/m/Button",
    "com/ccb/viaticos/model/formatter"
], function (Controller, ActionSheet, Button, formatter) {
    "use strict";

    return Controller.extend("com.ccb.viaticos.controller.Main", {

        formatter: formatter,

        /**
         * Inicialización del Dashboard.
         * Carga el resumen mensual y determina el rol del usuario.
         */
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteMain").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Se ejecuta al navegar al Dashboard: refresca el resumen mensual.
         * El usuario y su rol los carga el Component desde /api/v1/usuarios/me
         * (autenticación externa vía IAS).
         * @private
         */
        _onRoutePatternMatched: function () {
            this._cargarResumenMensual();
        },

        /**
         * Carga el resumen del mes (total gastado, número de gastos, pendientes)
         * Endpoint: GET /http/api/v1/gastos/resumen
         * @private
         */
        _cargarResumenMensual: function () {
            var oAppModel = this.getOwnerComponent().getModel("app");
            var oApiService = this.getOwnerComponent().getApiService();

            if (!oApiService.estaEnLinea()) {
                return;
            }

            oApiService.get("/api/v1/gastos/resumen")
                .then(function (oResumen) {
                    oAppModel.setProperty("/resumenMes", {
                        totalGastado: oResumen.totalGastado || 0,
                        numeroGastos: oResumen.numeroGastos || 0,
                        pendientesAprobacion: oResumen.pendientesAprobacion || 0
                    });
                })
                .catch(function () {
                    // Si falla la carga del resumen, se mantienen los valores en cero
                    // sin interrumpir el uso del dashboard
                });
        },

        /**
         * Abre el selector de método de captura de factura:
         * cámara (dispositivos móviles) o carga de archivo desde PC
         */
        onAbrirRegistrarGasto: function (oEvent) {
            var oRouter = this.getOwnerComponent().getRouter();
            var oDevice = this.getOwnerComponent().getModel("device");
            var bEsMovil = oDevice.getProperty("/system/phone") || oDevice.getProperty("/system/tablet");

            if (bEsMovil) {
                // En dispositivos móviles se ofrecen ambas opciones
                var oActionSheet = new ActionSheet({
                    title: this._texto("btnElegirMetodo"),
                    buttons: [
                        new Button({
                            text: this._texto("btnCapturarCamara"),
                            icon: "sap-icon://camera",
                            press: function () {
                                oRouter.navTo("RouteCapturaMobil");
                            }
                        }),
                        new Button({
                            text: this._texto("btnUsarArchivoInstead"),
                            icon: "sap-icon://upload",
                            press: function () {
                                oRouter.navTo("RouteCargaPC");
                            }
                        })
                    ],
                    cancelButton: new Button({
                        text: this._texto("btnCerrar"),
                        press: function () {
                            oActionSheet.close();
                        }
                    })
                });
                this.getView().addDependent(oActionSheet);
                oActionSheet.openBy(oEvent.getSource());
            } else {
                // En escritorio se navega directamente a la carga desde PC
                oRouter.navTo("RouteCargaPC");
            }
        },

        /**
         * Navega a la lista de gastos del empleado
         */
        onAbrirMisGastos: function () {
            this.getOwnerComponent().getRouter().navTo("RouteListaGastos");
        },

        /**
         * Navega a la lista de gastos pendientes de revisión (rol Analista)
         */
        onAbrirRevisionPendiente: function () {
            this.getOwnerComponent().getRouter().navTo("RouteListaGastos", {}, false);
            // La vista ListaGastos detecta el rol y aplica el filtro "En revisión" automáticamente
            var oModel = this.getOwnerComponent().getModel();
            oModel.setProperty("/filtroInicialPendientes", true);
        },

        /**
         * Obtiene un texto traducido del bundle i18n
         * @private
         */
        _texto: function (sClave) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sClave);
        }
    });
});
