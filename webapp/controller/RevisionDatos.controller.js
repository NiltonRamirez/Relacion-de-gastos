sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "com/ccb/viaticos/model/formatter",
    "com/ccb/viaticos/model/GastoModel"
], function (Controller, JSONModel, MessageToast, formatter, GastoModel) {
    "use strict";

    return Controller.extend("com.ccb.viaticos.controller.RevisionDatos", {

        formatter: formatter,

        /**
         * Inicialización de la vista de revisión y corrección de datos extraídos por OCR
         */
        onInit: function () {
            var oViewModel = new JSONModel({
                cargando: false,
                guardando: false,
                validandoDian: false,
                mensajeError: "",
                mostrarError: false,
                ciudades: GastoModel.CIUDADES_COLOMBIA
            });
            this.getView().setModel(oViewModel, "vm");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteRevisionDatos").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Al ingresar a la vista, carga los datos extraídos por OCR
         * correspondientes al jobId recibido en la ruta
         * @private
         */
        _onRoutePatternMatched: function (oEvent) {
            var sJobId = oEvent.getParameter("arguments").jobId;
            this._cargarDatosOcr(sJobId);
        },

        /**
         * Obtiene el resultado del OCR (datos extraídos + niveles de confianza)
         * y los carga en el modelo "gasto" de la vista
         * Endpoint: GET /http/api/v1/facturas/ocr/{jobId}
         * @param {string} sJobId - identificador del job de OCR
         * @private
         */
        _cargarDatosOcr: function (sJobId) {
            var oViewModel = this.getView().getModel("vm");
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oApiService = this.getOwnerComponent().getApiService();

            oViewModel.setProperty("/cargando", true);
            oViewModel.setProperty("/mostrarError", false);

            oApiService.get("/api/v1/facturas/ocr/" + sJobId)
                .then(function (oResultado) {
                    oViewModel.setProperty("/cargando", false);

                    // Mezclar la estructura base con los datos extraídos del OCR
                    var oGastoVacio = GastoModel.crearGastoVacio();
                    var oDatosExtraidos = oResultado.datos || {};

                    var oGasto = Object.assign(oGastoVacio, oDatosExtraidos);
                    oGasto.jobId = sJobId;
                    oGasto.confianzaOCR = oResultado.confianza || {};
                    oGasto.cufeSoloLectura = !!oDatosExtraidos.cufe;

                    // Recalcular IVA y total con los valores extraídos
                    if (!oGasto.valorIva) {
                        oGasto.valorIva = GastoModel.calcularIva(oGasto.subtotal);
                    }
                    oGasto.total = GastoModel.calcularTotal(oGasto);

                    oGastoModel.setData(oGasto);

                    this._evaluarTopeViaticos();
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/cargando", false);
                    oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                    oViewModel.setProperty("/mostrarError", true);
                }.bind(this));
        },

        /**
         * Recalcula automáticamente el valor del IVA (19%) cuando cambia el subtotal,
         * y luego recalcula el total general
         */
        onCambioSubtotal: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var fSubtotal = oGastoModel.getProperty("/subtotal");

            oGastoModel.setProperty("/valorIva", GastoModel.calcularIva(fSubtotal));
            this.onCambioTotales();
        },

        /**
         * Recalcula el total general = subtotal + IVA + impuestos adicionales + propina
         * y revalida el tope de viáticos de la categoría seleccionada
         */
        onCambioTotales: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oGasto = oGastoModel.getData();

            oGastoModel.setProperty("/total", GastoModel.calcularTotal(oGasto));
            this._evaluarTopeViaticos();
        },

        /**
         * Se ejecuta al cambiar la categoría del gasto: revalida el tope de viáticos
         */
        onCambioCategoria: function () {
            this._evaluarTopeViaticos();
        },

        /**
         * Valida que la descripción no supere los 500 caracteres permitidos
         */
        onCambioDescripcion: function (oEvent) {
            var sValor = oEvent.getParameter("value") || "";
            if (sValor.length > 500) {
                var oGastoModel = this.getOwnerComponent().getModel("gasto");
                oGastoModel.setProperty("/descripcionConsumo", sValor.substring(0, 500));
            }
        },

        /**
         * Verifica si el total actual supera el tope de viáticos configurado
         * para la categoría del gasto y actualiza el banner de advertencia.
         * Endpoint de referencia: GET /http/api/v1/topes-viaticos
         * @private
         */
        _evaluarTopeViaticos: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oGasto = oGastoModel.getData();
            var oApiService = this.getOwnerComponent().getApiService();

            // Validación local inmediata con los topes de referencia
            var oResultadoLocal = GastoModel.validarTopeViaticos(oGasto);
            oGastoModel.setProperty("/excedeTope", oResultadoLocal.excede);
            oGastoModel.setProperty("/topeAplicable", oResultadoLocal.tope);

            // Confirmar contra el backend (los topes oficiales se gestionan en SAP)
            if (oApiService.estaEnLinea()) {
                oApiService.get("/api/v1/topes-viaticos?categoria=" + encodeURIComponent(oGasto.categoriaGasto))
                    .then(function (oRespuesta) {
                        var fTope = oRespuesta.tope || oResultadoLocal.tope;
                        oGastoModel.setProperty("/topeAplicable", fTope);
                        oGastoModel.setProperty("/excedeTope", oGasto.total > fTope);
                    })
                    .catch(function () {
                        // Si falla la consulta, se conserva la validación local
                    });
            }
        },

        /**
         * Valida el NIT del proveedor ante la DIAN
         * Endpoint: POST /http/api/v1/dian/validar-nit
         */
        onValidarNitDian: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();
            var sNit = oGastoModel.getProperty("/nitProveedor");
            var sCufe = oGastoModel.getProperty("/cufe");

            if (!sNit) {
                return;
            }

            oViewModel.setProperty("/validandoDian", true);
            oGastoModel.setProperty("/estadoDian", "pendiente");
            oGastoModel.setProperty("/detalleDian", this._texto("dianValidando"));

            oApiService.post("/api/v1/dian/validar-nit", {
                nit: sNit,
                cufe: sCufe
            })
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/validandoDian", false);
                    if (oRespuesta.valido) {
                        oGastoModel.setProperty("/estadoDian", "valido");
                        oGastoModel.setProperty("/detalleDian", this._texto("dianValido"));
                    } else {
                        oGastoModel.setProperty("/estadoDian", "invalido");
                        oGastoModel.setProperty("/detalleDian", oRespuesta.detalle || this._texto("dianInvalido"));
                    }
                }.bind(this))
                .catch(function () {
                    oViewModel.setProperty("/validandoDian", false);
                    oGastoModel.setProperty("/estadoDian", "invalido");
                    oGastoModel.setProperty("/detalleDian", this._texto("dianError"));
                }.bind(this));
        },

        /**
         * Verifica que los campos obligatorios del formulario estén completos
         * @returns {boolean} true si el formulario es válido
         * @private
         */
        _validarCamposObligatorios: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oGasto = oGastoModel.getData();
            var oViewModel = this.getView().getModel("vm");

            var aCamposObligatorios = [
                "tipoDocumento", "numeroFactura", "fechaEmision", "nitProveedor",
                "razonSocialProveedor", "nombreEstablecimiento", "ciudad", "moneda",
                "formaPago", "categoriaGasto"
            ];

            var bValido = aCamposObligatorios.every(function (sCampo) {
                return !!oGasto[sCampo];
            });

            if (oGasto.total <= 0) {
                bValido = false;
            }

            if (!bValido) {
                oViewModel.setProperty("/mensajeError", this._texto("errCamposObligatorios"));
                oViewModel.setProperty("/mostrarError", true);
            } else {
                oViewModel.setProperty("/mostrarError", false);
            }

            return bValido;
        },

        /**
         * Guarda el gasto actual como borrador
         * Endpoint: POST /http/api/v1/gastos/borrador
         */
        onGuardarBorrador: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();

            oViewModel.setProperty("/guardando", true);
            oViewModel.setProperty("/mostrarError", false);

            oApiService.post("/api/v1/gastos/borrador", oGastoModel.getData())
                .then(function () {
                    oViewModel.setProperty("/guardando", false);
                    MessageToast.show(this._texto("msgBorradorGuardado"));
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/guardando", false);
                    oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                    oViewModel.setProperty("/mostrarError", true);
                }.bind(this));
        },

        /**
         * Registra el gasto definitivamente y navega a la pantalla de confirmación
         * Endpoint: POST /http/api/v1/gastos/registrar
         */
        onRegistrarGasto: function () {
            if (!this._validarCamposObligatorios()) {
                return;
            }

            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();
            var oRouter = this.getOwnerComponent().getRouter();

            oViewModel.setProperty("/guardando", true);
            oViewModel.setProperty("/mostrarError", false);

            oApiService.post("/api/v1/gastos/registrar", oGastoModel.getData())
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/guardando", false);

                    // Guardar el resultado en el modelo "" para que la Vista 6 lo muestre
                    var oModel = this.getOwnerComponent().getModel();
                    oModel.setProperty("/ultimoGastoRegistrado", {
                        numeroTransaccion: oRespuesta.numeroTransaccion,
                        proveedor: oGastoModel.getProperty("/razonSocialProveedor"),
                        categoria: oGastoModel.getProperty("/categoriaGasto"),
                        total: oGastoModel.getProperty("/total"),
                        fecha: oGastoModel.getProperty("/fechaEmision")
                    });

                    oRouter.navTo("RouteConfirmacion", { transaccionId: oRespuesta.numeroTransaccion });
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/guardando", false);
                    oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                    oViewModel.setProperty("/mostrarError", true);
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
        },

        /**
         * Traduce un error técnico en un mensaje legible para el usuario
         * @private
         */
        _mensajeDeError: function (oError) {
            if (oError && oError.status === 0) {
                return this._texto("errorConexion");
            }
            return this._texto("errorGenerico");
        }
    });
});
