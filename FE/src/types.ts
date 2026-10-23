export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  dept: string;
  designation: string;
  phone: string;
  join: string;
  birthday: string;
  mustChangePass: number;
}

export interface AttendanceRecord {
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
  editedByAdmin?: number;
}

export interface LeaveItem {
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

export interface NotificationItem {
  id: string;
  userId: string;
  text: string;
  time: string;
  read: number;
  created: number;
  kind?: string;
}

export interface OfficeInfo {
  configured: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number;
}

export interface GeoLoc {
  lat: string;
  lng: string;
  acc?: string;
  note?: string;
  demo?: boolean;
}

export interface Policy {
  id: string;
  title: string;
  filename: string;
  mime: string | null;
  size: number | null;
  createdBy: string | null;
  created: number;
}

export interface EodReport {
  id: string;
  userId: string;
  name: string;
  date: string;
  content: string;
  created: number;
}

export interface FeedbackItem {
  id: string;
  userId: string | null;
  name: string;
  mode: string;
  text: string;
  created: number;
}

export type Role = 'employee' | 'admin';
