"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearPreviewDOM = clearPreviewDOM;
exports.createPreviewDOM = createPreviewDOM;
function clearPreviewDOM(previewRoot) {
    while (previewRoot.firstChild) {
        previewRoot.removeChild(previewRoot.firstChild);
    }
}
function createPreviewDOM(table, previewRoot, index, direction) {
    clearPreviewDOM(previewRoot);
    var previewTable = document.createElement('table');
    var previewTableBody = document.createElement('tbody');
    previewTable.appendChild(previewTableBody);
    previewRoot.appendChild(previewTable);
    var rows = table.querySelectorAll('tr');
    if (direction === 'row') {
        var row = rows[index];
        var rowDOM = row.cloneNode(true);
        previewTableBody.appendChild(rowDOM);
    }
    else {
        rows.forEach(function (row) {
            var rowDOM = row.cloneNode(false);
            var cells = row.querySelectorAll('th,td');
            if (cells[index]) {
                var cellDOM = cells[index].cloneNode(true);
                rowDOM.appendChild(cellDOM);
                previewTableBody.appendChild(rowDOM);
            }
        });
    }
}
