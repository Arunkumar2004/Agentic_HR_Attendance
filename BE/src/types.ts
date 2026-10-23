import type { Request } from 'express';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  pass: string;
  role: string;
  dept: string;
  designation: string;
  phone: string;
  join: string;
  birthday: string;
  mustChangePass: number;
  tokenVersion: number;
}

export type PublicUser = Omit<UserRow, 'pass'>;

export interface AttendanceRow {
  id: string;
  userId: string;
  name: string;
  date: string;
  punchIn: string | null;
  punchInTS: number | null;
  punchInLoc: string | null;
  punchOut: string | null;
  punchOutTS: number | null;
  punchOutLoc: string | null;
  workMins: number | null;
  editedByAdmin: number;
}

export interface LeaveRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  from: string;
  to: string;
  reason: string;
  status: string;
  adminNote: string;
  appliedAt: number;
}

export interface NotificationRow {
  id: string;
  userId: string;
  text: string;
  time: string;
  read: number;
  created: number;
  kind?: string;
}

export interface AuthedRequest extends Request {
  user?: PublicUser;
}

export interface JwtPayload {
  id: string;
  role: string;
  name: string;
  email: string;
  v?: number;
}
