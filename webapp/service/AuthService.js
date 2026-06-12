sap.ui.define([
    "sap/ui/base/Object"
], function (BaseObject) {
    "use strict";

    // Clave usada para almacenar el token JWT en sessionStorage
    var TOKEN_KEY = "viaticos.authToken";
    var USER_KEY = "viaticos.userInfo";

    /**
     * Servicio de autenticación.
     * Maneja el login/registro contra CPI y la persistencia del token JWT
     * del IDP de SAP en sessionStorage (requerido por la app).
     */
    return BaseObject.extend("com.ccb.viaticos.service.AuthService", {

        constructor: function (oApiService) {
            this._oApiService = oApiService;
        },

        /**
         * Realiza el login del usuario contra CPI
         * Endpoint: POST /http/api/v1/auth/login
         * @param {string} sCorreo - correo corporativo
         * @param {string} sPassword - contraseña
         * @returns {Promise<object>} datos del usuario autenticado
         */
        login: function (sCorreo, sPassword) {
            return this._oApiService.post("/api/v1/auth/login", {
                correo: sCorreo,
                password: sPassword
            }, { conToken: false })
                .then(function (oRespuesta) {
                    if (oRespuesta && oRespuesta.token) {
                        this.guardarSesion(oRespuesta.token, oRespuesta.usuario);
                    }
                    return oRespuesta;
                }.bind(this));
        },

        /**
         * Registra un nuevo usuario corporativo
         * Endpoint: POST /http/api/v1/auth/registro
         * @param {object} oDatosRegistro - { nombreCompleto, correo, numeroIdentificacion, cargo }
         * @returns {Promise<object>} resultado del registro
         */
        registrar: function (oDatosRegistro) {
            return this._oApiService.post("/api/v1/auth/registro", oDatosRegistro, { conToken: false });
        },

        /**
         * Guarda el token JWT y la información del usuario en sessionStorage
         * @param {string} sToken - token JWT emitido por el IDP
         * @param {object} oUsuario - datos del usuario autenticado
         */
        guardarSesion: function (sToken, oUsuario) {
            sessionStorage.setItem(TOKEN_KEY, sToken);
            if (oUsuario) {
                sessionStorage.setItem(USER_KEY, JSON.stringify(oUsuario));
            }
        },

        /**
         * Obtiene el token JWT almacenado
         * @returns {string|null} token JWT o null si no hay sesión
         */
        getToken: function () {
            return sessionStorage.getItem(TOKEN_KEY);
        },

        /**
         * Obtiene la información del usuario autenticado
         * @returns {object|null} datos del usuario o null
         */
        getUsuario: function () {
            var sUsuario = sessionStorage.getItem(USER_KEY);
            return sUsuario ? JSON.parse(sUsuario) : null;
        },

        /**
         * Indica si existe una sesión activa
         * @returns {boolean} true si hay un token almacenado
         */
        estaAutenticado: function () {
            return !!this.getToken();
        },

        /**
         * Indica si el usuario autenticado tiene rol de analista financiero
         * @returns {boolean} true si el rol es "analista"
         */
        esAnalista: function () {
            var oUsuario = this.getUsuario();
            return !!oUsuario && oUsuario.rol === "analista";
        },

        /**
         * Cierra la sesión actual eliminando el token y los datos del usuario
         */
        cerrarSesion: function () {
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(USER_KEY);
        }
    });
});
