import express from 'express';
import fs from 'fs';
import path from 'path';
import { verifyFirebaseToken } from '../../middleware';
import { adminOnly } from '../../middleware/adminOnly';

const router = express.Router();

interface RoadmapItem {
  id: string;
  title: string;
  urgency: 'RED' | 'ORANGE' | 'BLUE';
  dueDate: string;
  summary: string;
  fullContext: string;
  action: string[];
}

/**
 * Simple parser for ROADMAP.md
 */
function parseRoadmap(content: string): RoadmapItem[] {
  const items: RoadmapItem[] = [];
  const sections = content.split('### ').slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const titleLine = lines[0].trim();
    
    const urgencyMatch = titleLine.match(/\[URGENCY: (RED|ORANGE|BLUE)\]/);
    const urgency = (urgencyMatch ? urgencyMatch[1] : 'BLUE') as 'RED' | 'ORANGE' | 'BLUE';
    const title = titleLine.replace(/\[URGENCY: (RED|ORANGE|BLUE)\]/, '').trim();

    const dueDateLine = lines.find(l => l.toLowerCase().includes('due date:'));
    const dueDate = dueDateLine ? dueDateLine.split(':')[1].trim() : 'TBD';

    const summaryLine = lines.find(l => l.toLowerCase().includes('summary:'));
    const summary = summaryLine ? summaryLine.split(':')[1].trim() : '';

    const contextIndex = lines.findIndex(l => l.toLowerCase().includes('full context:'));
    const actionIndex = lines.findIndex(l => l.toLowerCase().includes('action:'));

    let fullContext = '';
    if (contextIndex !== -1) {
      const endIdx = actionIndex !== -1 ? actionIndex : lines.length;
      fullContext = lines.slice(contextIndex + 1, endIdx).map(l => l.trim()).filter(l => l && !l.startsWith('-')).join(' ');
    }

    let action: string[] = [];
    if (actionIndex !== -1) {
      action = lines.slice(actionIndex + 1)
        .map(l => l.trim())
        .filter(l => l.startsWith('1.') || l.startsWith('2.') || l.startsWith('3.') || l.startsWith('4.') || l.startsWith('-'))
        .map(l => l.replace(/^\d+\.\s+/, '').replace(/^-\s+/, ''));
    }

    items.push({
      id: title.toLowerCase().replace(/\s+/g, '-'),
      title,
      urgency,
      dueDate,
      summary,
      fullContext,
      action
    });
  }

  return items;
}

router.get('/', verifyFirebaseToken, adminOnly, async (req, res) => {
  try {
    const roadmapPath = path.join(process.cwd(), 'ROADMAP.md');
    const protocolPath = path.join(process.cwd(), 'SECURITY_PROTOCOL.md');

    let roadmapItems: RoadmapItem[] = [];
    if (fs.existsSync(roadmapPath)) {
      const content = fs.readFileSync(roadmapPath, 'utf-8');
      roadmapItems = parseRoadmap(content);
    }

    // You could also parse SECURITY_PROTOCOL.md for specific "Security Notices" if needed
    // For now, we return the roadmap items which include security tasks

    res.json({
      success: true,
      data: roadmapItems,
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalTasks: roadmapItems.length,
        criticalTasks: roadmapItems.filter(i => i.urgency === 'RED').length
      }
    });
  } catch (error: any) {
    console.error('[ROADMAP ROUTE ERROR]', error);
    res.status(500).json({ error: 'Failed to retrieve roadmap data' });
  }
});

router.get('/raw/:file', verifyFirebaseToken, adminOnly, async (req, res) => {
  try {
    const { file } = req.params;
    let fileName = '';
    
    if (file === 'roadmap') fileName = 'ROADMAP.md';
    else if (file === 'security') fileName = 'SECURITY_PROTOCOL.md';
    else return res.status(400).json({ error: 'Invalid file requested' });

    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.setHeader('Content-Type', 'text/markdown');
    res.send(content);
  } catch (error: any) {
    console.error('[RAW_FILE_FETCH_ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch raw file' });
  }
});

export default router;
