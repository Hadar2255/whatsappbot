'use strict';

const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function hebrewWeekday(dateStr) {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  if (isNaN(d.getTime())) return '';
  return HEBREW_WEEKDAYS[d.getDay()];
}

module.exports = { hebrewWeekday };
