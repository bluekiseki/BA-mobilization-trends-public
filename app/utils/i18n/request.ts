import {getRequestConfig} from 'next-intl/server';
import { getLocaleFromHeaders } from './service';




export default getRequestConfig(async () => {
  
  const locale = await getLocaleFromHeaders()
 
  return {
    locale,
    messages: (await import(`../../../locales/${locale}.json`)).default
  };
});