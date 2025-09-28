import { dateConfig } from '$config/site';
import { strings } from '$lib/strings';

export const lastUpdatedStr = (updatedTime: string) => {
  // In minutes
  let lastUpdated = (new Date().getTime() - new Date(updatedTime).getTime()) / 60000;

  let cur = Math.round(lastUpdated);
  if (cur === 0) {
    return strings.JustNow();
  }
  if (cur < 60) {
    return strings.MinuteAgo(cur);
  }

  // In hours
  lastUpdated = lastUpdated / 60;
  cur = Math.round(lastUpdated);
  if (cur < 24) {
    return strings.HourAgo(cur);
  }

  // In days
  lastUpdated = lastUpdated / 24;
  cur = Math.round(lastUpdated);
  if (cur < 30) {
    return strings.DayAgo(cur);
  }

  // In months
  lastUpdated = lastUpdated / 30;
  cur = Math.round(lastUpdated);
  if (cur < 12) {
    return strings.MonthAgo(cur);
  }

  // In years
  lastUpdated = lastUpdated / 12;
  cur = Math.round(lastUpdated);

  return strings.YearAgo(cur);
};

export const defaultPublishedStr = (publishedTime: string) => {
  return new Date(publishedTime).toLocaleString(
    dateConfig.toPublishedString.locales,
    dateConfig.toPublishedString.options,
  );
};

export const defaultUpdatedStr = (updatedTime: string) => {
  return new Date(updatedTime).toLocaleString(dateConfig.toUpdatedString.locales, dateConfig.toUpdatedString.options);
};

export const dateTimeLocaleStr = (dateTime: string, locales: string, options: Intl.DateTimeFormatOptions) => {
  return new Date(dateTime).toLocaleString(locales, options);
};
