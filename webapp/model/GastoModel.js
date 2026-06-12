sap.ui.define([
    "sap/ui/model/json/JSONModel"
], function (JSONModel) {
    "use strict";

    /**
     * Modelo de datos del gasto de viaje.
     * Centraliza la estructura del documento de gasto extraído por OCR
     * y los cálculos de totales / topes de viáticos.
     */
    return {

        /**
         * Lista de ciudades de Colombia disponibles para el dropdown de ciudad
         */
        CIUDADES_COLOMBIA: [
            "Bogotá D.C.",
            "Medellín",
            "Cali",
            "Barranquilla",
            "Cartagena",
            "Bucaramanga",
            "Pereira",
            "Santa Marta",
            "Manizales",
            "Cúcuta",
            "Ibagué",
            "Villavicencio",
            "Pasto",
            "Montería",
            "Neiva",
            "Armenia",
            "Popayán",
            "Valledupar",
            "Sincelejo",
            "Tunja"
        ],

        /**
         * Topes de viáticos configurados por categoría (en COP)
         * Estos valores son referenciales; el valor real debe ser
         * confirmado por CPI/backend, pero se usan como respaldo offline.
         */
        TOPES_VIATICOS: {
            "Hospedaje": 350000,
            "Alimentación": 90000,
            "Transporte": 120000,
            "Otros": 60000
        },

        /**
         * Porcentaje de IVA estándar en Colombia
         */
        PORCENTAJE_IVA: 0.19,

        /**
         * Devuelve la estructura inicial del modelo "gasto": un lote vacío
         * de facturas, usado mientras el usuario captura/carga uno o varios
         * documentos antes de pasar a la Vista 5
         * @returns {object} estructura inicial del lote
         */
        crearLoteVacio: function () {
            return {
                facturas: [],
                indiceActual: 0
            };
        },

        /**
         * Devuelve un objeto de gasto vacío con la estructura completa
         * usada en la Vista 5 (Revisión de datos). Cada elemento del
         * arreglo "facturas" del modelo "gasto" tiene esta forma.
         * @returns {object} estructura inicial del gasto
         */
        crearGastoVacio: function () {
            return {
                jobId: "",
                tipoDocumento: "Factura venta",
                numeroFactura: "",
                cufe: "",
                cufeSoloLectura: false,
                fechaEmision: null,
                horaEmision: null,
                nitProveedor: "",
                razonSocialProveedor: "",
                nombreEstablecimiento: "",
                direccion: "",
                ciudad: "Bogotá D.C.",
                moneda: "COP",
                subtotal: 0,
                valorIva: 0,
                impuestosAdicionales: 0,
                propina: 0,
                total: 0,
                formaPago: "Efectivo",
                categoriaGasto: "Otros",
                descripcionConsumo: "",
                // Metadatos de confianza OCR por campo (0 - 1)
                confianzaOCR: {},
                // Estado de validación DIAN: "pendiente" | "valido" | "invalido"
                estadoDian: "pendiente",
                detalleDian: "",
                // Indicadores de archivo original
                archivoOrigen: null,
                rutaArchivo: null,
                excedeTope: false,
                topeAplicable: 0
            };
        },

        /**
         * Calcula el valor de IVA automáticamente a partir del subtotal (19%)
         * @param {number} fSubtotal - subtotal del gasto
         * @returns {number} valor de IVA calculado
         */
        calcularIva: function (fSubtotal) {
            var fBase = parseFloat(fSubtotal) || 0;
            return Math.round(fBase * this.PORCENTAJE_IVA);
        },

        /**
         * Calcula el total del gasto = subtotal + IVA + impuestos adicionales + propina
         * @param {object} oGasto - objeto de gasto
         * @returns {number} total calculado
         */
        calcularTotal: function (oGasto) {
            var fSubtotal = parseFloat(oGasto.subtotal) || 0;
            var fIva = parseFloat(oGasto.valorIva) || 0;
            var fAdicionales = parseFloat(oGasto.impuestosAdicionales) || 0;
            var fPropina = parseFloat(oGasto.propina) || 0;
            return Math.round(fSubtotal + fIva + fAdicionales + fPropina);
        },

        /**
         * Verifica si el total del gasto excede el tope configurado
         * para la categoría seleccionada
         * @param {object} oGasto - objeto de gasto (debe tener total y categoriaGasto)
         * @returns {object} { excede: boolean, tope: number }
         */
        validarTopeViaticos: function (oGasto) {
            var fTope = this.TOPES_VIATICOS[oGasto.categoriaGasto] || 0;
            var fTotal = parseFloat(oGasto.total) || 0;
            return {
                excede: fTope > 0 && fTotal > fTope,
                tope: fTope
            };
        }
    };
});
