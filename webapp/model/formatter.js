sap.ui.define([], function () {
    "use strict";

    /**
     * Formateadores reutilizables para vistas (moneda COP, fechas, estados, etc.)
     */
    return {

        /**
         * Formatea un valor numérico como moneda colombiana (COP)
         * Ejemplo: 150000 -> "$ 150.000"
         * @param {number} fValor - valor numérico
         * @returns {string} valor formateado en COP
         */
        formatoMonedaCOP: function (fValor) {
            if (fValor === null || fValor === undefined || isNaN(fValor)) {
                return "$ 0";
            }
            var sFormateado = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(fValor);
            return sFormateado;
        },

        /**
         * Formatea una fecha ISO (yyyy-MM-dd o timestamp) a formato colombiano dd/MM/yyyy
         * @param {string} sFecha - fecha en formato ISO
         * @returns {string} fecha formateada
         */
        formatoFechaCO: function (sFecha) {
            if (!sFecha) {
                return "";
            }
            var oFecha = new Date(sFecha);
            if (isNaN(oFecha.getTime())) {
                return sFecha;
            }
            var sDia = ("0" + oFecha.getDate()).slice(-2);
            var sMes = ("0" + (oFecha.getMonth() + 1)).slice(-2);
            var sAnio = oFecha.getFullYear();
            return sDia + "/" + sMes + "/" + sAnio;
        },

        /**
         * Formatea una fecha y hora ISO a formato colombiano dd/MM/yyyy HH:mm
         * @param {string} sFechaHora - fecha/hora ISO
         * @returns {string} fecha y hora formateada
         */
        formatoFechaHoraCO: function (sFechaHora) {
            if (!sFechaHora) {
                return "";
            }
            var oFecha = new Date(sFechaHora);
            if (isNaN(oFecha.getTime())) {
                return sFechaHora;
            }
            var sFecha = this.formatoFechaCO(sFechaHora);
            var sHora = ("0" + oFecha.getHours()).slice(-2) + ":" + ("0" + oFecha.getMinutes()).slice(-2);
            return sFecha + " " + sHora;
        },

        /**
         * Devuelve el ValueState de UI5 según el estado del gasto
         * @param {string} sEstado - estado del gasto (Registrado, En revision, Aprobado, Rechazado)
         * @returns {string} ValueState
         */
        estadoAValueState: function (sEstado) {
            switch (sEstado) {
                case "Registrado":
                    return "Information";
                case "En revision":
                case "En revisión":
                    return "Warning";
                case "Aprobado":
                    return "Success";
                case "Rechazado":
                    return "Error";
                default:
                    return "None";
            }
        },

        /**
         * Devuelve la clase CSS para el estado del gasto (usado en listas)
         * @param {string} sEstado - estado del gasto
         * @returns {string} nombre de clase CSS
         */
        estadoAClaseCss: function (sEstado) {
            switch (sEstado) {
                case "Registrado":
                    return "estadoRegistrado";
                case "En revision":
                case "En revisión":
                    return "estadoEnRevision";
                case "Aprobado":
                    return "estadoAprobado";
                case "Rechazado":
                    return "estadoRechazado";
                default:
                    return "";
            }
        },

        /**
         * Devuelve el ValueState de UI5 según el nivel de confianza del OCR
         * @param {number} fConfianza - valor entre 0 y 1
         * @returns {string} ValueState ("Warning" si confianza baja, "None" en caso contrario)
         */
        confianzaAValueState: function (fConfianza) {
            if (fConfianza === null || fConfianza === undefined) {
                return "None";
            }
            return fConfianza < 0.7 ? "Warning" : "None";
        },

        /**
         * Indica si se debe mostrar el ícono de advertencia por baja confianza OCR
         * @param {number} fConfianza - valor entre 0 y 1
         * @returns {boolean} true si la confianza es baja
         */
        confianzaEsBaja: function (fConfianza) {
            if (fConfianza === null || fConfianza === undefined) {
                return false;
            }
            return fConfianza < 0.7;
        },

        /**
         * Devuelve el ícono de validación DIAN según el estado de validación
         * @param {string} sEstadoDian - "valido" | "invalido" | "pendiente"
         * @returns {string} nombre del ícono SAP
         */
        dianAIcono: function (sEstadoDian) {
            switch (sEstadoDian) {
                case "valido":
                    return "sap-icon://message-success";
                case "invalido":
                    return "sap-icon://message-error";
                default:
                    return "sap-icon://pending";
            }
        },

        /**
         * Devuelve el color del ícono de validación DIAN
         * @param {string} sEstadoDian - "valido" | "invalido" | "pendiente"
         * @returns {string} valor de color SAP
         */
        dianAColor: function (sEstadoDian) {
            switch (sEstadoDian) {
                case "valido":
                    return "Positive";
                case "invalido":
                    return "Negative";
                default:
                    return "Neutral";
            }
        },

        /**
         * Convierte bytes a una cadena legible (KB / MB)
         * @param {number} iBytes - tamaño en bytes
         * @returns {string} tamaño formateado
         */
        formatoTamanoArchivo: function (iBytes) {
            if (!iBytes) {
                return "0 KB";
            }
            if (iBytes < 1024 * 1024) {
                return (iBytes / 1024).toFixed(0) + " KB";
            }
            return (iBytes / (1024 * 1024)).toFixed(2) + " MB";
        }
    };
});
