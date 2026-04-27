pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => e.preventDefault());

let selectedFiles = [];
let convertedOutput = null;

// UI elements
const dropZone = document.querySelector(".file-drop-zone");
const selectBtn = document.querySelector(".btn-yellow");
const clearBtn = document.querySelector(".btn-red");
const convertBtn = document.querySelector(".primary:not(.btn-green)");
const saveBtn = document.querySelector(".btn-green");
const statusArea = document.querySelector(".status-area");
const modeSelect = document.getElementById("conversion-mode");

// -------------------------------
// FILE SELECTION
// -------------------------------
selectBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".png, .jpg, .jpeg, .pdf";
    input.onchange = () => {
        selectedFiles = Array.from(input.files);
        updateStatus();
    };
    input.click();
});

// Drag & Drop
dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.style.background = "#eef3ff";
});

dropZone.addEventListener("dragleave", () => {
    dropZone.style.background = "#fff";
});

dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.style.background = "#fff";
    selectedFiles = Array.from(e.dataTransfer.files);
    updateStatus();
});

// Clear
clearBtn.addEventListener("click", () => {
    selectedFiles = [];
    convertedOutput = null;
    updateStatus("Zurückgesetzt.");
});

// -------------------------------
// STATUS UPDATE
// -------------------------------
function updateStatus(msg) {
    if (msg) {
        statusArea.textContent = msg;
        return;
    }

    if (selectedFiles.length === 0) {
        statusArea.textContent = "Noch keine Dateien ausgewählt.";
    } else {
        statusArea.textContent = "Ausgewählt: " + selectedFiles.map(f => 
        f.name.replace(/[<>]/g, "")
        ).join(", ");
    }
}

// -------------------------------
// PNG → PDF
// -------------------------------
async function convertPngToPdf() {
    const pdfDoc = await PDFLib.PDFDocument.create();

    for (let file of selectedFiles) {

        if (file.size > 20 * 1024 * 1024) {
            updateStatus("Datei zu groß (max. 20 MB).");
            return;
        }

        // Convert HEIC → PNG first
        if (file.type === "image/heic" || file.type === "image/heif") {
            updateStatus("HEIC wird in PNG umgewandelt...");
            file = await convertHeicToPngBlob(file);
        }

        const bytes = await file.arrayBuffer();
        let img;

        if (file.type === "image/png") {
            img = await pdfDoc.embedPng(bytes);
        } else if (file.type === "image/jpeg") {
            img = await pdfDoc.embedJpg(bytes);
        } else {
            updateStatus("Nicht unterstütztes Bildformat für PNG→PDF.");
            updateStatus("Dateityp: " + file.type);
            return;
        }

        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }

    const pdfBytes = await pdfDoc.save();
    convertedOutput = new Blob([pdfBytes], { type: "application/pdf" });

    updateStatus("Bilder erfolgreich in PDF umgewandelt.");
}

// -------------------------------
// PDF → PNG
// -------------------------------
async function convertPdfToPng() {
    const file = selectedFiles[0];
    const arrayBuffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (pdf.numPages > 50) {
        updateStatus("PDF zu groß (max. 50 Seiten).");
        return;
    }

    const pngFiles = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        pngFiles.push(blob);
    }

    convertedOutput = pngFiles;
    updateStatus("PDF erfolgreich in PNG-Bilder umgewandelt.");
}

// -------------------------------
// CONVERT BUTTON
// -------------------------------
convertBtn.addEventListener("click", async () => {
    if (selectedFiles.length === 0) {
        updateStatus("Bitte zuerst Dateien auswählen.");
        return;
    }

    const mode = modeSelect.value;

    if (mode === "png-to-pdf") {
        const allowed = [
            "image/png",
            "image/jpeg",
            "image/jpg"
        ];
        const allImages = selectedFiles.every(f => allowed.includes(f.type));
        if (!allImages) {
            updateStatus("Für diese Umwandlung wird ein anderes Dateiformat benötigt.");
            return;
        }
        await convertPngToPdf();
    }

    if (mode === "pdf-to-png") {
        if (selectedFiles.length !== 1 || selectedFiles[0].type !== "application/pdf") {
            updateStatus("PDF → PNG erfordert genau eine PDF-Datei.");
            return;
        }
        await convertPdfToPng();
    }
});

// -------------------------------
// SAVE BUTTON
// -------------------------------
saveBtn.addEventListener("click", () => {
    if (!convertedOutput) {
        updateStatus("Noch nichts zum Speichern vorhanden.");
        return;
    }

    const mode = modeSelect.value;

    if (mode === "png-to-pdf") {
        const url = URL.createObjectURL(convertedOutput);
        downloadFile(url, "converted.pdf");
    }

    if (mode === "pdf-to-png") {
        convertedOutput.forEach((blob, index) => {
            const url = URL.createObjectURL(blob);
            downloadFile(url, `page-${index + 1}.png`);
        });
    }
});

// -------------------------------
// DOWNLOAD HELPER
// -------------------------------
function downloadFile(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
}
