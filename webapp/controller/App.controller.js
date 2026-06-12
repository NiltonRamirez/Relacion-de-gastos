sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("com.ccb.viaticos.controller.App", {

        /**
         * Inicialización de la vista raíz (shell de navegación)
         */
        onInit: function () {
            // El shell no requiere lógica adicional; las vistas hijas
            // gestionan su propio ciclo de vida mediante el router
        }
    });
});
