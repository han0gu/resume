const ATTRIBUTION_QUERY_PARAM_MAP = {
  utm_source: "resume_company",
  utm_medium: "resume_channel",
  utm_campaign: "resume_campaign",
  utm_content: "resume_content",
};

const ATTRIBUTION_MAX_LENGTH = 64;
const ATTRIBUTION_VALUE_PATTERN = /^[a-z0-9_-]+$/;
const PHONE_DIGIT_THRESHOLD = 7;

function normalizeAttributionValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized.length > ATTRIBUTION_MAX_LENGTH) {
    return "";
  }

  if (!ATTRIBUTION_VALUE_PATTERN.test(normalized)) {
    return "";
  }

  const digitCount = normalized.replace(/[^0-9]/g, "").length;

  if (digitCount >= PHONE_DIGIT_THRESHOLD) {
    return "";
  }

  return normalized;
}

function getAttributionParams(search) {
  const searchParams = new URLSearchParams(
    typeof search === "string" ? search : ""
  );

  return Object.keys(ATTRIBUTION_QUERY_PARAM_MAP).reduce(function (
    attributionParams,
    queryParam
  ) {
    const eventParam = ATTRIBUTION_QUERY_PARAM_MAP[queryParam];
    const normalizedValue = normalizeAttributionValue(
      searchParams.get(queryParam)
    );

    if (normalizedValue) {
      attributionParams[eventParam] = normalizedValue;
    }

    return attributionParams;
  },
  {});
}

function mergeEventParams(eventParams, attributionParams) {
  return Object.assign({}, eventParams || {}, attributionParams || {});
}

function bootstrapAnalytics() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const measurementId = process.env.GA_MEASUREMENT_ID || "";

  if (!measurementId) {
    return;
  }

  const attributionParams = getAttributionParams(window.location.search);
  const viewedSections = new Set();

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  function trackEvent(eventName, eventParams) {
    window.gtag(
      "event",
      eventName,
      mergeEventParams(eventParams, attributionParams)
    );
  }

  function trackSectionView(sectionId) {
    if (!sectionId || viewedSections.has(sectionId)) {
      return;
    }

    viewedSections.add(sectionId);
    trackEvent("resume_section_view", {
      section_id: sectionId,
    });
  }

  function bindSectionTracking() {
    const sections = document.querySelectorAll("[data-analytics-section]");

    if (!sections.length) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      sections.forEach(function (section) {
        trackSectionView(section.dataset.analyticsSection);
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }

          trackSectionView(entry.target.dataset.analyticsSection);
          observer.unobserve(entry.target);
        });
      },
      {
        // Large resume sections can be taller than the viewport.
        threshold: 0.01,
      }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  function bindLinkTracking() {
    const links = document.querySelectorAll("[data-analytics-id]");

    links.forEach(function (link) {
      link.addEventListener("click", function () {
        trackEvent("resume_link_click", {
          link_id: link.dataset.analyticsId,
          link_group: link.dataset.analyticsGroup || "unknown",
        });
      });
    });
  }

  function loadAnalyticsScript() {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");

      script.async = true;
      script.src =
        "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);
    });
  }

  loadAnalyticsScript()
    .then(function () {
      window.gtag("js", new Date());
      window.gtag("config", measurementId, {
        send_page_view: false,
      });
      trackEvent("page_view", {
        page_location: window.location.href,
        page_path: window.location.pathname,
        page_title: document.title,
      });

      bindSectionTracking();
      bindLinkTracking();
    })
    .catch(function () {
      // Ignore analytics bootstrap failures so the resume stays functional.
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ATTRIBUTION_MAX_LENGTH,
    ATTRIBUTION_QUERY_PARAM_MAP,
    ATTRIBUTION_VALUE_PATTERN,
    PHONE_DIGIT_THRESHOLD,
    bootstrapAnalytics,
    getAttributionParams,
    mergeEventParams,
    normalizeAttributionValue,
  };
}

bootstrapAnalytics();
