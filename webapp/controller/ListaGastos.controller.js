sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/ccb/viaticos/model/formatter"
], function (Controller, JSONModel, MessageToast, MessageBox, formatter) {
    "use strict";

    return Controller.extend("com.ccb.viaticos.controller.ListaGastos", {

        formatter: formatter,

        /**
         * Inicialización de la vista de lista de gastos
         */
        onInit: function () {
            var oViewModel = new JSONModel({
                cargando: false,
                gastos: [],
                gastoSeleccionado: {},
                mostrarMotivoRechazo: false,
                motivoRechazo: "",
                filtros: {
                    fechaDesde: null,
                    fechaHasta: null,
                    categoria: "",
                    estado: "",
                    montoMinimo: "",
                    montoMaximo: ""
                }
            });
            this.getView().setModel(oViewModel, "vm");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteListaGastos").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Al ingresar a la vista, determina si debe mostrarse la lista de
         * "Pendientes de revisión" (analista) o "Mis gastos" (empleado),
         * y carga los datos correspondientes
         * @private
         */
        _onRoutePatternMatched: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oAppModel = this.getOwnerComponent().getModel("app");
            var oViewModel = this.getView().getModel("vm");

            if (oModel.getProperty("/filtroInicialPendientes") && oAppModel.getProperty("/esAnalista")) {
                oViewModel.setProperty("/filtros/estado", "En revision");
                oModel.setProperty("/filtroInicialPendientes", false);
            }

            this._cargarGastos();
        },

        /**
         * Carga la lista de gastos aplicando los filtros actuales.
         * Para analistas financieros se consulta el endpoint de pendientes
         * cuando el filtro de estado es "En revisión"; en cualquier otro
         * caso se consulta la lista general de gastos.
         * Endpoints:
         *   GET /http/api/v1/gastos?filtros...
         *   GET /http/api/v1/gastos/pendientes
         * @private
         */
        _cargarGastos: function () {
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();
            var oAppModel = this.getOwnerComponent().getModel("app");
            var oFiltros = oViewModel.getProperty("/filtros");

            oViewModel.setProperty("/cargando", true);

            var sEndpoint = "/api/v1/gastos";
            if (oAppModel.getProperty("/esAnalista") && oFiltros.estado === "En revision") {
                sEndpoint = "/api/v1/gastos/pendientes";
            }

            var aParametros = [];
            if (oFiltros.fechaDesde) {
                aParametros.push("fechaDesde=" + encodeURIComponent(this._formatoFechaISO(oFiltros.fechaDesde)));
            }
            if (oFiltros.fechaHasta) {
                aParametros.push("fechaHasta=" + encodeURIComponent(this._formatoFechaISO(oFiltros.fechaHasta)));
            }
            if (oFiltros.categoria) {
                aParametros.push("categoria=" + encodeURIComponent(oFiltros.categoria));
            }
            if (oFiltros.estado) {
                aParametros.push("estado=" + encodeURIComponent(oFiltros.estado));
            }
            if (oFiltros.montoMinimo) {
                aParametros.push("montoMinimo=" + encodeURIComponent(oFiltros.montoMinimo));
            }
            if (oFiltros.montoMaximo) {
                aParametros.push("montoMaximo=" + encodeURIComponent(oFiltros.montoMaximo));
            }

            var sQuery = aParametros.length ? "?" + aParametros.join("&") : "";

            oApiService.get(sEndpoint + sQuery)
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/cargando", false);
                    oViewModel.setProperty("/gastos", oRespuesta.gastos || []);
                })
                .catch(function () {
                    oViewModel.setProperty("/cargando", false);
                    oViewModel.setProperty("/gastos", []);
                    MessageToast.show(this._texto("errorGenerico"));
                }.bind(this));
        },

        /**
         * Convierte un objeto Date a formato ISO (yyyy-MM-dd)
         * @private
         */
        _formatoFechaISO: function (oFecha) {
            if (!oFecha) {
                return "";
            }
            var oDate = new Date(oFecha);
            var sAnio = oDate.getFullYear();
            var sMes = ("0" + (oDate.getMonth() + 1)).slice(-2);
            var sDia = ("0" + oDate.getDate()).slice(-2);
            return sAnio + "-" + sMes + "-" + sDia;
        },

        /**
         * Aplica los filtros seleccionados y recarga la lista
         */
        onAplicarFiltros: function () {
            this._cargarGastos();
        },

        /**
         * Limpia todos los filtros y recarga la lista completa
         */
        onLimpiarFiltros: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setProperty("/filtros", {
                fechaDesde: null,
                fechaHasta: null,
                categoria: "",
                estado: "",
                montoMinimo: "",
                montoMaximo: ""
            });
            this._cargarGastos();
        },

        /**
         * Abre el diálogo de detalle completo del gasto seleccionado
         * Endpoint: GET /http/api/v1/gastos/{id}
         */
        onAbrirDetalle: function (oEvent) {
            var oContexto = oEvent.getSource().getBindingContext("vm");
            var oGastoResumen = oContexto.getObject();
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();
            var oDialog = this.byId("dialogoDetalle");

            oViewModel.setProperty("/gastoSeleccionado", oGastoResumen);
            oViewModel.setProperty("/mostrarMotivoRechazo", false);
            oViewModel.setProperty("/motivoRechazo", "");

            oDialog.open();

            // Cargar el detalle completo (incluye datos no presentes en la lista)
            oApiService.get("/api/v1/gastos/" + oGastoResumen.id)
                .then(function (oDetalle) {
                    oViewModel.setProperty("/gastoSeleccionado", oDetalle);
                })
                .catch(function () {
                    // Si falla la carga del detalle, se mantiene la información de la lista
                });
        },

        /**
         * Cierra el diálogo de detalle
         */
        onCerrarDetalle: function () {
            this.byId("dialogoDetalle").close();
        },

        /**
         * Descarga la factura asociada al gasto seleccionado
         * Endpoint: GET /http/api/v1/gastos/{id}/factura
         */
        onDescargarFactura: function () {
            var oViewModel = this.getView().getModel("vm");
            var oGasto = oViewModel.getProperty("/gastoSeleccionado");
            var oApiService = this.getOwnerComponent().getApiService();

            oApiService.descargarArchivo("/api/v1/gastos/" + oGasto.id + "/factura")
                .then(function (oBlob) {
                    var sUrl = window.URL.createObjectURL(oBlob);
                    var oEnlace = document.createElement("a");
                    oEnlace.href = sUrl;
                    oEnlace.download = "factura_" + oGasto.numeroFactura + ".pdf";
                    document.body.appendChild(oEnlace);
                    oEnlace.click();
                    document.body.removeChild(oEnlace);
                    window.URL.revokeObjectURL(sUrl);
                })
                .catch(function () {
                    MessageToast.show(this._texto("errorGenerico"));
                }.bind(this));
        },

        /**
         * Aprueba el gasto seleccionado (rol Analista financiero)
         * Endpoint: POST /http/api/v1/gastos/{id}/aprobar
         */
        onAprobarGasto: function () {
            var oViewModel = this.getView().getModel("vm");
            var oGasto = oViewModel.getProperty("/gastoSeleccionado");
            var oApiService = this.getOwnerComponent().getApiService();

            oApiService.post("/api/v1/gastos/" + oGasto.id + "/aprobar", {})
                .then(function () {
                    MessageToast.show(this._texto("estadoAprobado"));
                    this.byId("dialogoDetalle").close();
                    this._cargarGastos();
                }.bind(this))
                .catch(function () {
                    MessageToast.show(this._texto("errorGenerico"));
                }.bind(this));
        },

        /**
         * Solicita el motivo de rechazo o, si ya fue indicado, envía el rechazo
         * Endpoint: POST /http/api/v1/gastos/{id}/rechazar
         */
        onRechazarGasto: function () {
            var oViewModel = this.getView().getModel("vm");
            var bMostrarMotivo = oViewModel.getProperty("/mostrarMotivoRechazo");

            if (!bMostrarMotivo) {
                oViewModel.setProperty("/mostrarMotivoRechazo", true);
                return;
            }

            var sMotivo = oViewModel.getProperty("/motivoRechazo");
            if (!sMotivo) {
                MessageBox.warning(this._texto("errCamposObligatorios"));
                return;
            }

            var oGasto = oViewModel.getProperty("/gastoSeleccionado");
            var oApiService = this.getOwnerComponent().getApiService();

            oApiService.post("/api/v1/gastos/" + oGasto.id + "/rechazar", { motivo: sMotivo })
                .then(function () {
                    MessageToast.show(this._texto("estadoRechazado"));
                    this.byId("dialogoDetalle").close();
                    this._cargarGastos();
                }.bind(this))
                .catch(function () {
                    MessageToast.show(this._texto("errorGenerico"));
                }.bind(this));
        },

        /**
         * Regresa al dashboard
         */
        onVolver: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMain");
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
