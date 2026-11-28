export const goalLimits = { title: 100 }

interface RegistrationFields {
  title: string
  time: string
}

export function isValidRegistration({ title, time }: RegistrationFields) {
  return title.trim().length > 0 && title.length <= goalLimits.title &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
}

const tokyoDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function nextWakeAt(time: string, now = new Date()) {
  const today = tokyoDate.format(now)
  const wakeAt = `${today}T${time}:00+09:00`
  if (Date.parse(wakeAt) >= now.getTime()) return wakeAt

  // Advance the calendar date in UTC to avoid the browser's local timezone.
  const tomorrow = new Date(`${today}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return `${tomorrow.toISOString().slice(0, 10)}T${time}:00+09:00`
}
