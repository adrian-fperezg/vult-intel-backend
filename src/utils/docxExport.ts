import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, IParagraphOptions } from 'docx';
import { saveAs } from 'file-saver';

/**
 * Parses a simple markdown-like string into Docx Paragraphs.
 * Handles headings (H1, H2, H3), bold text (**text**), and bullet points (- or *).
 */
const parseMarkdownToDocx = (text: string): Paragraph[] => {
    const paragraphs: Paragraph[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            paragraphs.push(new Paragraph({ text: '' }));
            continue;
        }

        let headingLevel: any;
        let isBullet = false;
        let isNumbered = false;
        let content = trimmed;

        // Check headings
        if (trimmed.startsWith('# ')) {
            headingLevel = HeadingLevel.HEADING_1;
            content = trimmed.substring(2);
        } else if (trimmed.startsWith('## ')) {
            headingLevel = HeadingLevel.HEADING_2;
            content = trimmed.substring(3);
        } else if (trimmed.startsWith('### ')) {
            headingLevel = HeadingLevel.HEADING_3;
            content = trimmed.substring(4);
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            isBullet = true;
            content = trimmed.substring(2);
        } else if (/^\d+\.\s/.test(trimmed)) {
            isNumbered = true;
            content = trimmed.replace(/^\d+\.\s/, '');
        }

        // Parse bold text
        const textRuns: TextRun[] = [];
        const boldRegex = /\*\*(.*?)\*\*/g;
        let lastIndex = 0;
        let match;

        while ((match = boldRegex.exec(content)) !== null) {
            // Add text before bold
            if (match.index > lastIndex) {
                textRuns.push(new TextRun({ text: content.substring(lastIndex, match.index) }));
            }
            // Add bold text
            textRuns.push(new TextRun({ text: match[1], bold: true }));
            lastIndex = boldRegex.lastIndex;
        }

        // Add remaining text
        if (lastIndex < content.length) {
            textRuns.push(new TextRun({ text: content.substring(lastIndex) }));
        }

        // Create paragraph options
        let pOptions: any = { children: textRuns };

        if (headingLevel) {
            pOptions.heading = headingLevel;
        }

        // Simplistic lists for now, indenting slightly
        if (isBullet) {
            pOptions.bullet = { level: 0 };
        }

        // Add spacing after normal paragraphs
        if (!headingLevel && !isBullet && !isNumbered) {
            pOptions.spacing = { after: 200 };
        }

        paragraphs.push(new Paragraph(pOptions as IParagraphOptions));
    }

    return paragraphs;
};

/**
 * Exports formatted markdown or plain text to a .docx file.
 * 
 * @param content The text/markdown content to be exported
 * @param fileName The desired filename (without the .docx extension)
 */
export const exportToDocx = async (content: string, fileName: string) => {
    try {
        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children: parseMarkdownToDocx(content),
                },
            ],
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${fileName}.docx`);
        return true;
    } catch (error) {
        console.error("Error generating DOCX:", error);
        return false;
    }
};
