import { demoStore } from "../data/demoStore.js";
import { env } from "../config/env.js";
import type { Business, BusinessHour, SpecialClosure } from "../types/index.js";

const COLOMBIA_TIME_ZONE = "America/Bogota";
const DAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function parseTimeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function getColombiaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    dayOfWeek: weekdayIndex[value("weekday")] ?? 0,
    minutes: Number(value("hour")) * 60 + Number(value("minute"))
  };
}

function formatTimeLabel(time: string) {
  const minutes = parseTimeToMinutes(time);
  const hours24 = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  const suffix = hours24 >= 12 ? "p. m." : "a. m.";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutesPart).padStart(2, "0")} ${suffix}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export class BusinessService {
  getDefaultBusiness(): Business {
    return demoStore.businesses[0];
  }

  getBusinessHours(businessId: string): BusinessHour[] {
    return demoStore.businessHours.filter((hour) => hour.businessId === businessId);
  }

  getSpecialClosures(businessId: string): SpecialClosure[] {
    return demoStore.specialClosures.filter((closure) => closure.businessId === businessId);
  }

  getBusinessOpenStatus(business: Business, date = new Date()) {
    const forcedOpen = env.LOCAL_FORCE_BUSINESS_OPEN && env.NODE_ENV !== "production";
    const manualOverride = business.status.manualOpenOverride;
    const colombiaNow = getColombiaDateParts(date);
    const todayHours = this.getHoursForDay(business.id, colombiaNow.dayOfWeek);
    const closure = this.getSpecialClosures(business.id).find(
      (item) => item.date === colombiaNow.dateKey
    );
    const scheduleOpen = this.isOpenBySchedule(business, date);
    const isOpen = forcedOpen || (manualOverride !== null ? manualOverride : scheduleOpen);
    const nextOpen = isOpen ? null : this.findNextOpenWindow(business, date);
    const reason =
      manualOverride === false
        ? "Cierre manual"
        : !business.status.acceptingOrders
          ? "Pedidos pausados"
          : !business.status.deliveryEnabled
            ? "Domicilios pausados"
            : closure
              ? closure.reason
              : todayHours?.isOpen === false
                ? "Dia cerrado"
                : "Fuera de horario";

    return {
      isOpen,
      timeZone: COLOMBIA_TIME_ZONE,
      localDateKey: colombiaNow.dateKey,
      localDay: DAY_NAMES[colombiaNow.dayOfWeek] ?? "hoy",
      localTime: this.formatMinutesLabel(colombiaNow.minutes),
      reason,
      todayHours,
      todayLabel: todayHours?.isOpen
        ? `${formatTimeLabel(todayHours.opensAt)} a ${formatTimeLabel(todayHours.closesAt)}`
        : "cerrado",
      nextOpen,
      weeklySummary: this.formatWeeklyHours(business.id)
    };
  }

  isBusinessOpen(business: Business, date = new Date()) {
    if (env.LOCAL_FORCE_BUSINESS_OPEN && env.NODE_ENV !== "production") {
      return true;
    }

    if (business.status.manualOpenOverride !== null) {
      return business.status.manualOpenOverride;
    }

    if (!business.status.acceptingOrders || !business.status.deliveryEnabled) {
      return false;
    }

    return this.isOpenBySchedule(business, date);
  }

  private isOpenBySchedule(business: Business, date = new Date()) {
    if (!business.status.acceptingOrders || !business.status.deliveryEnabled) {
      return false;
    }

    const colombiaNow = getColombiaDateParts(date);
    const closure = demoStore.specialClosures.find(
      (item) => item.businessId === business.id && item.date === colombiaNow.dateKey
    );
    if (closure) {
      return false;
    }
    const currentMinutes = colombiaNow.minutes;
    const todayHours = this.getHoursForDay(business.id, colombiaNow.dayOfWeek);

    if (!todayHours) {
      return false;
    }

    if (!todayHours.isOpen) {
      return false;
    }

    const opensAt = parseTimeToMinutes(todayHours.opensAt);
    const closesAt = parseTimeToMinutes(todayHours.closesAt);

    if (closesAt < opensAt) {
      return currentMinutes >= opensAt || currentMinutes <= closesAt;
    }

    return currentMinutes >= opensAt && currentMinutes <= closesAt;
  }

  private findNextOpenWindow(business: Business, date = new Date()) {
    for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
      const candidateDate = addDays(date, dayOffset);
      const parts = getColombiaDateParts(candidateDate);
      const hours = this.getHoursForDay(business.id, parts.dayOfWeek);
      const closure = this.getSpecialClosures(business.id).find((item) => item.date === parts.dateKey);
      if (!hours?.isOpen || closure) {
        continue;
      }

      const opensAt = parseTimeToMinutes(hours.opensAt);
      const closesAt = parseTimeToMinutes(hours.closesAt);
      const canOpenToday =
        dayOffset > 0 ||
        parts.minutes < opensAt ||
        (closesAt < opensAt && parts.minutes > closesAt && parts.minutes < opensAt);
      if (!canOpenToday) {
        continue;
      }

      return {
        day: dayOffset === 0 ? "hoy" : dayOffset === 1 ? "manana" : DAY_NAMES[parts.dayOfWeek],
        dateKey: parts.dateKey,
        opensAt: hours.opensAt,
        closesAt: hours.closesAt,
        label: `${dayOffset === 0 ? "hoy" : dayOffset === 1 ? "manana" : DAY_NAMES[parts.dayOfWeek]} desde ${formatTimeLabel(hours.opensAt)}`
      };
    }

    return null;
  }

  private getHoursForDay(businessId: string, dayOfWeek: number) {
    return demoStore.businessHours.find(
      (item) => item.businessId === businessId && item.dayOfWeek === dayOfWeek
    );
  }

  private formatWeeklyHours(businessId: string) {
    return this.getBusinessHours(businessId)
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((hour) => ({
        day: DAY_NAMES[hour.dayOfWeek] ?? `dia ${hour.dayOfWeek}`,
        isOpen: hour.isOpen,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        label: hour.isOpen
          ? `${DAY_NAMES[hour.dayOfWeek]}: ${formatTimeLabel(hour.opensAt)} a ${formatTimeLabel(hour.closesAt)}`
          : `${DAY_NAMES[hour.dayOfWeek]}: cerrado`
      }));
  }

  private formatMinutesLabel(minutes: number) {
    const hours24 = Math.floor(minutes / 60);
    const minutesPart = minutes % 60;
    const suffix = hours24 >= 12 ? "p. m." : "a. m.";
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${String(minutesPart).padStart(2, "0")} ${suffix}`;
  }
}
