import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { authRequired, adminOnly } from '../middleware/auth';
import { AuthedRequest } from '../types';
import { uid } from '../agents/clock';

const router = Router();
import { requireFeature } from '../agents/features';
router.use(requireFeature('policies', 'Company Policies'));

export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]);

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, Word, Excel, text or image files allowed'));
  },
});

export interface PolicyRow {
  id: string;
  title: string;
  filename: string;
  mime: string | null;
  size: number | null;
  createdBy: string | null;
  created: number;
}

// GET /api/policies — everyone logged in can read the company library
router.get('/', authRequired, (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM policies ORDER BY created DESC').all();
  res.json({ policies: rows });
});

// POST /api/policies — admin uploads { title } + file
router.post('/', authRequired, adminOnly, (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    const me = (req as AuthedRequest).user!;
    const title = String((req.body as { title?: unknown }).title || '').trim();
    const f = (req as Request & { file?: Express.Multer.File }).file;
    if (!title) {
      if (f) fs.unlink(f.path, () => undefined);
      res.status(400).json({ error: 'Title required' });
      return;
    }
    if (!f) {
      res.status(400).json({ error: 'Choose a file to upload' });
      return;
    }
    const id = uid('p');
    db.prepare('INSERT INTO policies (id,title,filename,mime,size,createdBy,created) VALUES (?,?,?,?,?,?,?)').run(
      id, title, f.originalname, f.mimetype, f.size, me.id, Date.now(),
    );
    try {
      fs.renameSync(f.path, path.join(UPLOAD_DIR, id));
    } catch {
      /* keep multer temp name as fallback */
    }
    const row = db.prepare('SELECT * FROM policies WHERE id = ?').get(id);
    res.status(201).json({ policy: row, message: `Policy "${title}" published` });
  });
});

// GET /api/policies/:id/download — everyone logged in can read files
router.get('/:id/download', authRequired, (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM policies WHERE id = ?').get(req.params.id) as unknown as PolicyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }
  const direct = path.join(UPLOAD_DIR, req.params.id);
  if (!fs.existsSync(direct)) {
    res.status(404).json({ error: 'File missing on server' });
    return;
  }
  res.download(direct, row.filename);
});

// DELETE /api/policies/:id — admin removes policy + file
router.delete('/:id', authRequired, adminOnly, (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM policies WHERE id = ?').get(req.params.id) as unknown as PolicyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }
  db.prepare('DELETE FROM policies WHERE id = ?').run(req.params.id);
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, req.params.id));
  } catch {
    /* already gone */
  }
  res.json({ message: 'Policy removed' });
});

export default router;
