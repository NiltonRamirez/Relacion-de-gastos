#!/usr/bin/env node
/**
 * Script para crear el archivo ZIP del HTML5 app para deployment en BTP
 */
const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

const distFolder = path.join(__dirname, 'dist');
const outputZip = path.join(__dirname, 'dist', 'comccbviaticos.zip');

// Verificar que existe la carpeta dist
if (!fs.existsSync(distFolder)) {
    console.error('❌ Error: La carpeta dist no existe. Ejecuta npm run build primero.');
    process.exit(1);
}

// Crear el archivo ZIP
console.log('📦 Creando comccbviaticos.zip...');

const output = fs.createWriteStream(outputZip);
const archive = archiver('zip', {
    zlib: { level: 9 } // Máxima compresión
});

output.on('close', function() {
    console.log('✅ ZIP creado exitosamente: ' + archive.pointer() + ' bytes');
    console.log('📁 Archivo: ' + outputZip);
});

archive.on('error', function(err) {
    console.error('❌ Error creando ZIP:', err);
    process.exit(1);
});

// Pipe archive data to the file
archive.pipe(output);

// Agregar todos los archivos de la carpeta dist en la raíz del ZIP
// EXCEPTO el ZIP mismo
const files = fs.readdirSync(distFolder);
files.forEach(file => {
    if (file !== 'comccbviaticos.zip') {
        const filePath = path.join(distFolder, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
            archive.file(filePath, { name: file });
        } else if (stat.isDirectory()) {
            archive.directory(filePath, file);
        }
    }
});

// Finalizar el archivo
archive.finalize();
