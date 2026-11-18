import { useTranslation } from 'react-i18next';
import { EventPlanner } from './EventPlanner';
import type { EventData, IconData, StudentData } from '~/types/plannerData';

interface EventPlannerLoaderProp {
  isLoading: boolean;
  error: string | null;
  eventId: number;
  eventData: EventData | null;
  iconData: IconData | null;
  allStudents: StudentData;
}
export const EventPlannerLoader = ({ isLoading, error, eventId, eventData, iconData, allStudents }: EventPlannerLoaderProp) => {
  const { t } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');

  if (isLoading) return <div className="text-center p-8">{t_ui('loading')}</div>;
  if (error) return <div className="text-center p-8 text-red-500">{error}</div>;
  if (!eventData) return <div className="text-center p-8">{t('error.eventDataDisplayFailed')}</div>;
  if (!iconData) return <div className="text-center p-8">Unable to display icon data.</div>;

  return <EventPlanner eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} />;
};
