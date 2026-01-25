import { useTranslation } from 'react-i18next';
import { EventPlanner } from './EventPlanner';
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';

interface EventPlannerLoaderProp {
  isLoading: boolean;
  error: string | null;
  eventId: number;
  eventData: EventData | null;
  iconData: IconData | null;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
}
export const EventPlannerLoader = ({ isLoading, error, eventId, eventData, iconData, allStudents, studentPortraits }: EventPlannerLoaderProp) => {
  const { t } = useTranslation('planner');
  const { t: t_c } = useTranslation('common');

  if (isLoading) return <div className="text-center p-8">{t_c('loading_txt')}</div>;
  if (error) return <div className="text-center p-8 text-red-500">{error}</div>;
  if (!eventData) return <div className="text-center p-8">{t('error.eventDataDisplayFailed')}</div>;
  if (!iconData) return <div className="text-center p-8">Unable to display icon data.</div>;

  return <EventPlanner eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} studentPortraits={studentPortraits} />;
};
