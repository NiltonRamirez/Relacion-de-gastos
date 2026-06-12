sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    // Expresión regular básica para validar formato de correo electrónico
    var REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return Controller.extend("com.ccb.viaticos.controller.Login", {

        /**
         * Inicialización de la vista de Login / Registro.
         * Crea el modelo de vista "vm" con el estado de ambos formularios.
         */
        onInit: function () {
            var oViewModel = new JSONModel({
                mostrarRegistro: false,
                login: {
                    correo: "",
                    password: "",
                    correoState: "None",
                    correoStateText: "",
                    passwordState: "None",
                    passwordStateText: "",
                    mensajeError: "",
                    mostrarError: false,
                    cargando: false
                },
                registro: {
                    nombreCompleto: "",
                    correo: "",
                    numeroIdentificacion: "",
                    cargo: "",
                    nombreState: "None",
                    correoState: "None",
                    correoStateText: "",
                    identificacionState: "None",
                    cargoState: "None",
                    mensajeError: "",
                    mostrarError: false,
                    mostrarExito: false,
                    cargando: false
                }
            });
            this.getView().setModel(oViewModel, "vm");
        },

        /**
         * Valida en tiempo real el campo de correo del formulario de login
         */
        onValidarCorreoLogin: function () {
            var oViewModel = this.getView().getModel("vm");
            var sCorreo = oViewModel.getProperty("/login/correo");

            if (!sCorreo) {
                oViewModel.setProperty("/login/correoState", "Error");
                oViewModel.setProperty("/login/correoStateText", this._texto("errCampoRequerido"));
            } else if (!REGEX_CORREO.test(sCorreo)) {
                oViewModel.setProperty("/login/correoState", "Error");
                oViewModel.setProperty("/login/correoStateText", this._texto("errCorreoInvalido"));
            } else {
                oViewModel.setProperty("/login/correoState", "None");
                oViewModel.setProperty("/login/correoStateText", "");
            }
        },

        /**
         * Valida en tiempo real el campo de contraseña del formulario de login
         */
        onValidarPasswordLogin: function () {
            var oViewModel = this.getView().getModel("vm");
            var sPassword = oViewModel.getProperty("/login/password");

            if (!sPassword) {
                oViewModel.setProperty("/login/passwordState", "Error");
                oViewModel.setProperty("/login/passwordStateText", this._texto("errCampoRequerido"));
            } else {
                oViewModel.setProperty("/login/passwordState", "None");
                oViewModel.setProperty("/login/passwordStateText", "");
            }
        },

        /**
         * Maneja el envío del formulario de login.
         * Llama a AuthService.login() y navega al Dashboard si es exitoso.
         */
        onIngresar: function () {
            this.onValidarCorreoLogin();
            this.onValidarPasswordLogin();

            var oViewModel = this.getView().getModel("vm");
            var oLogin = oViewModel.getProperty("/login");

            if (oLogin.correoState === "Error" || oLogin.passwordState === "Error") {
                return;
            }

            oViewModel.setProperty("/login/mostrarError", false);
            oViewModel.setProperty("/login/cargando", true);

            var oAuthService = this.getOwnerComponent().getAuthService();

            oAuthService.login(oLogin.correo, oLogin.password)
                .then(function (oRespuesta) {
                    oViewModel.setProperty("/login/cargando", false);

                    // Actualizar el modelo "app" con la información del usuario autenticado
                    var oAppModel = this.getOwnerComponent().getModel("app");
                    oAppModel.setProperty("/usuario", oRespuesta.usuario);
                    oAppModel.setProperty("/autenticado", true);

                    this.getOwnerComponent().getRouter().navTo("RouteMain");
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/login/cargando", false);
                    var sMensaje = oError.status === 401
                        ? this._texto("errCredencialesInvalidas")
                        : this._texto("errorConexion");
                    oViewModel.setProperty("/login/mensajeError", sMensaje);
                    oViewModel.setProperty("/login/mostrarError", true);
                }.bind(this));
        },

        /**
         * Muestra el formulario de registro
         */
        onMostrarRegistro: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setProperty("/mostrarRegistro", true);
            oViewModel.setProperty("/registro/mostrarExito", false);
            oViewModel.setProperty("/registro/mostrarError", false);
        },

        /**
         * Vuelve al formulario de login
         */
        onVolverLogin: function () {
            var oViewModel = this.getView().getModel("vm");
            oViewModel.setProperty("/mostrarRegistro", false);
        },

        /**
         * Valida en tiempo real los campos requeridos del formulario de registro
         */
        onValidarRegistro: function () {
            var oViewModel = this.getView().getModel("vm");
            var oRegistro = oViewModel.getProperty("/registro");

            oViewModel.setProperty("/registro/nombreState", oRegistro.nombreCompleto ? "None" : "Error");
            oViewModel.setProperty("/registro/identificacionState", oRegistro.numeroIdentificacion ? "None" : "Error");
            oViewModel.setProperty("/registro/cargoState", oRegistro.cargo ? "None" : "Error");

            if (!oRegistro.correo) {
                oViewModel.setProperty("/registro/correoState", "Error");
                oViewModel.setProperty("/registro/correoStateText", this._texto("errCampoRequerido"));
            } else if (!REGEX_CORREO.test(oRegistro.correo)) {
                oViewModel.setProperty("/registro/correoState", "Error");
                oViewModel.setProperty("/registro/correoStateText", this._texto("errCorreoInvalido"));
            } else {
                oViewModel.setProperty("/registro/correoState", "None");
                oViewModel.setProperty("/registro/correoStateText", "");
            }
        },

        /**
         * Maneja el envío del formulario de registro.
         * Llama a AuthService.registrar() y muestra mensaje de éxito o de
         * "usuario ya existe" según la respuesta del backend.
         */
        onRegistrar: function () {
            this.onValidarRegistro();

            var oViewModel = this.getView().getModel("vm");
            var oRegistro = oViewModel.getProperty("/registro");

            var bValido = oRegistro.nombreState === "None" &&
                oRegistro.correoState === "None" &&
                oRegistro.identificacionState === "None" &&
                oRegistro.cargoState === "None" &&
                oRegistro.correo && oRegistro.nombreCompleto &&
                oRegistro.numeroIdentificacion && oRegistro.cargo;

            if (!bValido) {
                return;
            }

            oViewModel.setProperty("/registro/mostrarError", false);
            oViewModel.setProperty("/registro/mostrarExito", false);
            oViewModel.setProperty("/registro/cargando", true);

            var oAuthService = this.getOwnerComponent().getAuthService();

            oAuthService.registrar({
                nombreCompleto: oRegistro.nombreCompleto,
                correo: oRegistro.correo,
                numeroIdentificacion: oRegistro.numeroIdentificacion,
                cargo: oRegistro.cargo
            })
                .then(function () {
                    oViewModel.setProperty("/registro/cargando", false);
                    oViewModel.setProperty("/registro/mostrarExito", true);
                    MessageToast.show(this._texto("msgRegistroExitoso"));

                    // Limpiar el formulario tras el registro exitoso
                    oViewModel.setProperty("/registro/nombreCompleto", "");
                    oViewModel.setProperty("/registro/correo", "");
                    oViewModel.setProperty("/registro/numeroIdentificacion", "");
                    oViewModel.setProperty("/registro/cargo", "");
                }.bind(this))
                .catch(function (oError) {
                    oViewModel.setProperty("/registro/cargando", false);
                    var sMensaje = oError.status === 409
                        ? this._texto("errUsuarioExiste")
                        : this._texto("errorConexion");
                    oViewModel.setProperty("/registro/mensajeError", sMensaje);
                    oViewModel.setProperty("/registro/mostrarError", true);
                }.bind(this));
        },

        /**
         * Obtiene un texto traducido del bundle i18n
         * @param {string} sClave - clave del texto
         * @returns {string} texto traducido
         * @private
         */
        _texto: function (sClave) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sClave);
        }
    });
});
