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
                indiceActual: 0,
                totalFacturas: 0,
                mensajeError: "",
                mostrarError: false,
                ciudades: GastoModel.CIUDADES_COLOMBIA
            });
            this.getView().setModel(oViewModel, "vm");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteRevisionDatos").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        /**
         * Al ingresar a la vista, carga los datos extraídos por OCR del lote
         * de jobIds (separados por coma) recibido en la ruta
         * @private
         */
        _onRoutePatternMatched: function (oEvent) {
            var sJobIds = oEvent.getParameter("arguments").jobIds;
            var aJobIds = sJobIds.split(",");
            this._cargarDatosOcrLote(aJobIds);
        },

        /**
         * Obtiene los resultados del OCR (datos extraídos + niveles de confianza)
         * de todo el lote y los carga en el modelo "gasto" de la vista
         * Endpoint: GET /http/api/v1/facturas/ocr/lote?jobIds=...
         * @param {Array<string>} aJobIds - identificadores de los jobs de OCR
         * @private
         */
        _cargarDatosOcrLote: function (aJobIds) {
            var oViewModel = this.getView().getModel("vm");
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oApiService = this.getOwnerComponent().getApiService();
            var sJobIds = aJobIds.join(",");

            oViewModel.setProperty("/cargando", true);
            oViewModel.setProperty("/mostrarError", false);

            oApiService.get("/api/v1/facturas/ocr/lote?jobIds=" + encodeURIComponent(sJobIds))
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/cargando", false);

                    var aResultados = (oRespuesta && oRespuesta.resultados) || [];
                    var aFacturas = aResultados.map(function (oResultado, iIndice) {
                        var oGastoVacio = GastoModel.crearGastoVacio();
                        var oDatosExtraidos = oResultado.datos || {};

                        var oGasto = Object.assign(oGastoVacio, oDatosExtraidos);
                        oGasto.jobId = aJobIds[iIndice];
                        oGasto.confianzaOCR = oResultado.confianza || {};
                        oGasto.cufeSoloLectura = !!oDatosExtraidos.cufe;

                        // Recalcular IVA y total con los valores extraídos
                        if (!oGasto.valorIva) {
                            oGasto.valorIva = GastoModel.calcularIva(oGasto.subtotal);
                        }
                        oGasto.total = GastoModel.calcularTotal(oGasto);

                        var oTope = GastoModel.validarTopeViaticos(oGasto);
                        oGasto.excedeTope = oTope.excede;
                        oGasto.topeAplicable = oTope.tope;

                        return oGasto;
                    });

                    oGastoModel.setProperty("/facturas", aFacturas);
                    oGastoModel.setProperty("/indiceActual", 0);
                    oViewModel.setProperty("/indiceActual", 0);
                    oViewModel.setProperty("/totalFacturas", aFacturas.length);

                    this._enlazarFacturaActual();
                    this._evaluarTopeViaticosActual();
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/cargando", false);
                    oViewModel.setProperty("/mensajeError", this._mensajeDeError(oError));
                    oViewModel.setProperty("/mostrarError", true);
                }.bind(this));
        },

        /**
         * Enlaza el contenedor "facturaContainer" al elemento del arreglo
         * "gasto>/facturas" correspondiente al índice actual
         * @private
         */
        _enlazarFacturaActual: function () {
            var oViewModel = this.getView().getModel("vm");
            var iIndice = oViewModel.getProperty("/indiceActual");

            this.byId("facturaContainer").bindElement({
                path: "/facturas/" + iIndice,
                model: "gasto"
            });
        },

        /**
         * Devuelve la ruta absoluta del modelo "gasto" hacia la factura
         * que se está revisando actualmente
         * @returns {string} ruta absoluta (ej. "/facturas/0/")
         * @private
         */
        _rutaFacturaActual: function () {
            var oViewModel = this.getView().getModel("vm");
            return "/facturas/" + oViewModel.getProperty("/indiceActual") + "/";
        },

        /**
         * Navega a la factura anterior del lote
         */
        onFacturaAnterior: function () {
            var oViewModel = this.getView().getModel("vm");
            var iIndice = oViewModel.getProperty("/indiceActual");
            if (iIndice > 0) {
                oViewModel.setProperty("/indiceActual", iIndice - 1);
                this.getOwnerComponent().getModel("gasto").setProperty("/indiceActual", iIndice - 1);
                this._enlazarFacturaActual();
            }
        },

        /**
         * Navega a la siguiente factura del lote
         */
        onFacturaSiguiente: function () {
            var oViewModel = this.getView().getModel("vm");
            var iIndice = oViewModel.getProperty("/indiceActual");
            if (iIndice + 1 < oViewModel.getProperty("/totalFacturas")) {
                oViewModel.setProperty("/indiceActual", iIndice + 1);
                this.getOwnerComponent().getModel("gasto").setProperty("/indiceActual", iIndice + 1);
                this._enlazarFacturaActual();
            }
        },

        /**
         * Recalcula automáticamente el valor del IVA (19%) cuando cambia el subtotal,
         * y luego recalcula el total general
         */
        onCambioSubtotal: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var sRuta = this._rutaFacturaActual();
            var fSubtotal = oGastoModel.getProperty(sRuta + "subtotal");

            oGastoModel.setProperty(sRuta + "valorIva", GastoModel.calcularIva(fSubtotal));
            this.onCambioTotales();
        },

        /**
         * Recalcula el total general = subtotal + IVA + impuestos adicionales + propina
         * y revalida el tope de viáticos de la categoría seleccionada
         */
        onCambioTotales: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var sRuta = this._rutaFacturaActual();
            var oGasto = oGastoModel.getProperty(sRuta);

            oGastoModel.setProperty(sRuta + "total", GastoModel.calcularTotal(oGasto));
            this._evaluarTopeViaticosActual();
        },

        /**
         * Se ejecuta al cambiar la categoría del gasto: revalida el tope de viáticos
         */
        onCambioCategoria: function () {
            this._evaluarTopeViaticosActual();
        },

        /**
         * Valida que la descripción no supere los 500 caracteres permitidos
         */
        onCambioDescripcion: function (oEvent) {
            var sValor = oEvent.getParameter("value") || "";
            if (sValor.length > 500) {
                var oGastoModel = this.getOwnerComponent().getModel("gasto");
                oGastoModel.setProperty(this._rutaFacturaActual() + "descripcionConsumo", sValor.substring(0, 500));
            }
        },

        /**
         * Verifica si el total actual de la factura en revisión supera el tope de
         * viáticos configurado para su categoría y actualiza el banner de advertencia.
         * Endpoint de referencia: GET /http/api/v1/topes-viaticos
         * @private
         */
        _evaluarTopeViaticosActual: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oApiService = this.getOwnerComponent().getApiService();
            var sRuta = this._rutaFacturaActual();
            var oGasto = oGastoModel.getProperty(sRuta);

            // Validación local inmediata con los topes de referencia
            var oResultadoLocal = GastoModel.validarTopeViaticos(oGasto);
            oGastoModel.setProperty(sRuta + "excedeTope", oResultadoLocal.excede);
            oGastoModel.setProperty(sRuta + "topeAplicable", oResultadoLocal.tope);

            // Confirmar contra el backend (los topes oficiales se gestionan en SAP)
            if (oApiService.estaEnLinea()) {
                oApiService.get("/api/v1/topes-viaticos?categoria=" + encodeURIComponent(oGasto.categoriaGasto))
                    .then(function (oRespuesta) {
                        var fTope = oRespuesta.tope || oResultadoLocal.tope;
                        oGastoModel.setProperty(sRuta + "topeAplicable", fTope);
                        oGastoModel.setProperty(sRuta + "excedeTope", oGasto.total > fTope);
                    })
                    .catch(function () {
                        // Si falla la consulta, se conserva la validación local
                    });
            }
        },

        /**
         * Valida el NIT del proveedor de la factura en revisión ante la DIAN
         * Endpoint: POST /http/api/v1/dian/validar-nit
         */
        onValidarNitDian: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();
            var sRuta = this._rutaFacturaActual();
            var sNit = oGastoModel.getProperty(sRuta + "nitProveedor");
            var sCufe = oGastoModel.getProperty(sRuta + "cufe");

            if (!sNit) {
                return;
            }

            oViewModel.setProperty("/validandoDian", true);
            oGastoModel.setProperty(sRuta + "estadoDian", "pendiente");
            oGastoModel.setProperty(sRuta + "detalleDian", this._texto("dianValidando"));

            oApiService.post("/api/v1/dian/validar-nit", {
                nit: sNit,
                cufe: sCufe
            })
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/validandoDian", false);
                    if (oRespuesta.valido) {
                        oGastoModel.setProperty(sRuta + "estadoDian", "valido");
                        oGastoModel.setProperty(sRuta + "detalleDian", this._texto("dianValido"));
                    } else {
                        oGastoModel.setProperty(sRuta + "estadoDian", "invalido");
                        oGastoModel.setProperty(sRuta + "detalleDian", oRespuesta.detalle || this._texto("dianInvalido"));
                    }
                }.bind(this))
                .catch(function () {
                    oViewModel.setProperty("/validandoDian", false);
                    oGastoModel.setProperty(sRuta + "estadoDian", "invalido");
                    oGastoModel.setProperty(sRuta + "detalleDian", this._texto("dianError"));
                }.bind(this));
        },

        /**
         * Verifica que los campos obligatorios estén completos en todas las
         * facturas del lote. Si alguna factura no es válida, navega hacia ella
         * y muestra el mensaje de error correspondiente.
         * @returns {boolean} true si todas las facturas del lote son válidas
         * @private
         */
        _validarCamposObligatorios: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oViewModel = this.getView().getModel("vm");
            var aFacturas = oGastoModel.getProperty("/facturas");

            var aCamposObligatorios = [
                "tipoDocumento", "numeroFactura", "fechaEmision", "nitProveedor",
                "razonSocialProveedor", "nombreEstablecimiento", "ciudad", "moneda",
                "formaPago", "categoriaGasto"
            ];

            for (var i = 0; i < aFacturas.length; i++) {
                var oGasto = aFacturas[i];
                var bValido = aCamposObligatorios.every(function (sCampo) {
                    return !!oGasto[sCampo];
                });

                if (oGasto.total <= 0) {
                    bValido = false;
                }

                if (!bValido) {
                    oViewModel.setProperty("/indiceActual", i);
                    oGastoModel.setProperty("/indiceActual", i);
                    this._enlazarFacturaActual();
                    oViewModel.setProperty("/mensajeError", this._texto("errCamposObligatoriosFactura", [i + 1]));
                    oViewModel.setProperty("/mostrarError", true);
                    return false;
                }
            }

            oViewModel.setProperty("/mostrarError", false);
            return true;
        },

        /**
         * Guarda el lote completo de gastos como borradores
         * Endpoint: POST /http/api/v1/gastos/borrador (body { gastos: [...] })
         */
        onGuardarBorrador: function () {
            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();

            oViewModel.setProperty("/guardando", true);
            oViewModel.setProperty("/mostrarError", false);

            oApiService.post("/api/v1/gastos/borrador", {
                gastos: oGastoModel.getProperty("/facturas")
            })
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
         * Registra el lote completo de gastos definitivamente y navega a la
         * pantalla de confirmación
         * Endpoint: POST /http/api/v1/gastos/registrar (body { gastos: [...] },
         *           respuesta { transacciones: [...] })
         */
        onRegistrarGasto: function () {
            if (!this._validarCamposObligatorios()) {
                return;
            }

            var oGastoModel = this.getOwnerComponent().getModel("gasto");
            var oViewModel = this.getView().getModel("vm");
            var oApiService = this.getOwnerComponent().getApiService();
            var oRouter = this.getOwnerComponent().getRouter();
            var aFacturas = oGastoModel.getProperty("/facturas");

            oViewModel.setProperty("/guardando", true);
            oViewModel.setProperty("/mostrarError", false);

            oApiService.post("/api/v1/gastos/registrar", {
                gastos: aFacturas
            })
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/guardando", false);

                    var aTransacciones = (oRespuesta && oRespuesta.transacciones) || [];

                    // Guardar los resultados en el modelo "" para que la Vista 6 los muestre
                    var oModel = this.getOwnerComponent().getModel();
                    oModel.setProperty("/gastosRegistrados", aTransacciones.map(function (oTransaccion, iIndice) {
                        var oGasto = aFacturas[iIndice] || {};
                        return {
                            numeroTransaccion: oTransaccion.numeroTransaccion,
                            proveedor: oGasto.razonSocialProveedor,
                            categoria: oGasto.categoriaGasto,
                            total: oGasto.total,
                            fecha: oGasto.fechaEmision
                        };
                    }));

                    var sTransaccionIds = aTransacciones.map(function (oTransaccion) {
                        return oTransaccion.numeroTransaccion;
                    }).join(",");

                    oRouter.navTo("RouteConfirmacion", { transaccionIds: sTransaccionIds });
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
        _texto: function (sClave, aParametros) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sClave, aParametros);
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
