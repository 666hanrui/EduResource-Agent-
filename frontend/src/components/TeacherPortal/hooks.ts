import { useEffect, useState } from 'react';
import type { Student, TeacherDashboard, TeacherIndustrySummary } from './model';
import { normalizeStudents } from './utils';

interface TeacherRemoteData {
  dashboard: TeacherDashboard | null;
  dashboardStudents: Student[];
  industrySummary: TeacherIndustrySummary | null;
  error: string | null;
}

export function useTeacherRemoteData({
  teacherId,
  classId,
}: {
  teacherId: string;
  classId: string;
}): TeacherRemoteData {
  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null);
  const [dashboardStudents, setDashboardStudents] = useState<Student[]>([]);
  const [industrySummary, setIndustrySummary] = useState<TeacherIndustrySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';

    fetch(`/api/teachers/${teacherId}/dashboard${query}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return response.json() as Promise<TeacherDashboard>;
      })
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setDashboardStudents(normalizeStudents(data.attention_queue));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [classId, teacherId]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/teachers/industry-data/summary?program=software-engineering')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return response.json() as Promise<TeacherIndustrySummary>;
      })
      .then((data) => {
        if (!cancelled) setIndustrySummary(data);
      })
      .catch(() => {
        if (!cancelled) setIndustrySummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    dashboard,
    dashboardStudents,
    industrySummary,
    error,
  };
}
