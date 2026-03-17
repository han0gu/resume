(function () {
  const measurementId = process.env.GA_MEASUREMENT_ID || "";

  if (!measurementId) {
    return;
  }

  const viewedSections = new Set();

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  function trackSectionView(sectionId) {
    if (!sectionId || viewedSections.has(sectionId)) {
      return;
    }

    viewedSections.add(sectionId);
    window.gtag("event", "resume_section_view", {
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
        window.gtag("event", "resume_link_click", {
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
      window.gtag("event", "page_view", {
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
})();
