sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("com.ccb.viaticos.controller.App", {

        /**
         * Inicialización de la vista raíz (shell de navegación).
         * Aplica la clase de densidad de contenido (compact en escritorio,
         * cozy en dispositivos táctiles) a toda la app.
         */
        onInit: function () {
            this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
        }
    });
});
