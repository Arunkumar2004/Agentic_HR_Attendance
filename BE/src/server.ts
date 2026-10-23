import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { db, initDatabase } from './db/database';
import * as excel from './db/excel';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import attRoutes from './routes/attendance';
import leaveRoutes from './routes/leaves';
import notifRoutes from './routes/notifications';
import rulesRoutes from './routes/rules';
import monitorRoutes from './routes/monitor';
import hrRoutes from './routes/hr';
import policyRoutes from './routes/policies';
import eodRoutes from './routes/eod';
import feedbackRoutes from './routes/feedback';
import settingsRoutes from './routes/settings';
import { authRequired } from './middleware/auth';
import { siteGate } from './middleware/siteGate';
import { runMonitor } from './agents/monitor';
import { isEnabled } from './agents/features';

const app = express();
const PORT = Number(process.env.PORT || 5003);
app.set('trust proxy', 1); // correct IPs behind Nginx

// Security headers + login brute-force protection
app.use(helmet({ contentSecurityPolicy: false }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300 }));

// Wrap async handlers so a rejected promise becomes an HTTP 500, never a crash.
const crashLog = path.join(__dirname, 'crash.log');
const CR = (m: string): void => {
  try {
    fs.appendFileSync(crashLog, `[${new Date().toISOString()}] ${m}\n`);
  } catch {
    /* ignore */
  }
};
process.on('unhandledRejection', (err) => {
  CR('UNHANDLED REJECTION: ' + ((err as Error)?.stack || String(err)));
});
process.on('uncaughtException', (err) => {
  CR('UNCAUGHT EXCEPTION: ' + ((err as Error)?.stack || String(err)));
});

app.use(cors());
app.use(express.json({ limit: '200kb' }));

// Health check stays open for monitors (also bypasses the site gate).
app.get('/healthz', (_req: Request, res: Response) => res.json({ ok: true }));
app.use(siteGate);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/eod', eodRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/excel/info', authRequired, (_req: Request, res: Response) => {
  res.json({ excelPath: excel.EXCEL_PATH });
});

app.get('/api/excel/download', authRequired, (_req: Request, res: Response) => {
  // Prefer the real roster file when present; otherwise generate the full
  // workbook live from the database so the download never fails.
  fs.access(excel.EXCEL_PATH, fs.constants.R_OK, (err) => {
    if (!err) {
      res.download(excel.EXCEL_PATH, 'Elan 1 Employee Attendance Track.xlsx');
      return;
    }
    excel
      .buildFullWorkbook()
      .then((buf) => {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Elan1 Full Attendance.xlsx"');
        res.send(buf);
      })
      .catch((e: unknown) => {
        console.error(e);
        res.status(500).json({ error: 'Failed to build workbook' });
      });
  });
});

app.get('/api/excel/today', authRequired, (req: Request, res: Response) => {
  excel
    .buildTodayWorkbook()
    .then((buf) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Elan1 Attendance Today.xlsx"');
      res.send(buf);
    })
    .catch((err: unknown) => {
      console.error(err);
      res.status(500).json({ error: 'Failed to build today sheet' });
    });
});

// Serve the React production build (live layout: BE/ + FE/ siblings)
const feDir = path.join(__dirname, '..', '..', 'FE', 'dist');
app.use(express.static(feDir));
app.get('/', (_req: Request, res: Response) => res.sendFile(path.join(feDir, 'index.html')));

app.use((_req: Request, res: Response) => res.status(404).json({ error: 'Endpoint not found' }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Elan1 backend (TS) running at http://localhost:${PORT}`);
      console.log(`API base: http://localhost:${PORT}/api`);
      console.log(`Excel file: ${excel.EXCEL_PATH}`);
    });
    // Monitor Agent scheduler: full check every 5 minutes (absence timing,
    // missing checkouts, patterns). Skipped entirely when switched off in Settings.
    const tick = (): void => {
      try {
        if (!isEnabled('monitor')) return;
        runMonitor('tick');
      } catch (e) {
        console.error('[monitor:tick]', (e as Error).message);
      }
    };
    setInterval(tick, 5 * 60 * 1000);
    setTimeout(tick, 30 * 1000); // catch up shortly after boot
  })
  .catch((err: unknown) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });

const graceful = (): void => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
};
process.on('SIGINT', graceful);
process.on('SIGTERM', graceful);
