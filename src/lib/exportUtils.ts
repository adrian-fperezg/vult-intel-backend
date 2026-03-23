import { createGoogleDocFromHtml, createGoogleSheetFromCsv } from '../services/googleWorkspaceService';

export const exportToDoc = async (html: string, title: string = 'Document') => {
    const newWindow = window.open('', '_blank');
    if (newWindow) {
        newWindow.document.write('<body style="background:#0F1115;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><h2>Creating Google Doc...</h2></body>');
    }

    try {
        const url = await createGoogleDocFromHtml(html, title);
        if (newWindow) {
            newWindow.location.href = url;
        } else {
            window.location.href = url;
        }
    } catch (error) {
        if (newWindow) newWindow.close();
        console.error("Failed to export to Google Docs:", error);
        throw error;
    }
};

export const exportToCsv = async (rows: any[][], title: string = 'Data') => {
    const newWindow = window.open('', '_blank');
    if (newWindow) {
        newWindow.document.write('<body style="background:#0F1115;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><h2>Creating Google Sheet...</h2></body>');
    }

    try {
        const csvContent = rows.map(e => e.map(cell => {
            if (cell === null || cell === undefined) return '';
            const cellStr = String(cell);
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
        }).join(",")).join("\n");

        const url = await createGoogleSheetFromCsv(csvContent, title);
        if (newWindow) {
            newWindow.location.href = url;
        } else {
            window.location.href = url;
        }
    } catch (error) {
        if (newWindow) newWindow.close();
        console.error("Failed to export to Google Sheets:", error);
        throw error;
    }
};

export const convertMarkdownToHtml = (markdown: string) => {
    if (!markdown) return '';
    let html = markdown
        .replace(/^### (.*$)/gim, '<h4>$1</h4>')
        .replace(/^## (.*$)/gim, '<h3>$1</h3>')
        .replace(/^# (.*$)/gim, '<h2>$1</h2>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/\n-(.*)/gim, '<ul><li>$1</li></ul>')
        .replace(/\n/gim, '<br />');

    html = html.replace(/<\/ul><br \/><ul>/gim, '');
    return html;
};
