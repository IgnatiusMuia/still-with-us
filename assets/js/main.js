(() => {
  "use strict";

  const STORAGE_KEYS = {
    payment: "swu.payment.v2",
    booking: "swu.booking.v2"
  };
  const LEGACY_STORAGE_KEYS = ["swu.member.v1", "swu.payment.v1", "swu.booking.v1"];

  const PAYMENT_DELAY = 1100;
  const TRAVEL_RATE = 2;
  const MAX_MILES = 500;
  const PROCESSORS = ["Skrill", "Neteller"];
  const SERVICE_NAMES = {
    direct: "Direct Communication with the Dead",
    guidance: "Psychic Guidance",
    group: "Group Session",
    coaching: "Spiritual Coaching"
  };

  const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const byId = (id) => document.getElementById(id);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let storageWorking = true;
  const memoryStore = new Map();
  let announceTimer = null;
  let paymentTimer = null;
  let pendingCheckout = null;
  let paymentProcessing = false;

  const refs = {
    liveRegion: byId("live-region"),
    navToggle: byId("menu-toggle"),
    navMenu: byId("primary-menu"),
    progressA: byId("progress-step-a"),
    serviceSelect: byId("service-select"),
    groupSizeWrap: byId("group-size-wrap"),
    groupSize: byId("group-size"),
    modeRadios: all('input[name="format"]'),
    modeFieldset: byId("step-a-form").querySelector(".mode-fieldset"),
    modeError: byId("mode-error"),
    onlineNote: byId("online-note"),
    inPersonFields: byId("in-person-fields"),
    bookingAddress: byId("booking-address"),
    bookingMiles: byId("booking-miles"),
    bookingName: byId("booking-name"),
    bookingEmail: byId("booking-email"),
    bookingConsent: byId("booking-consent"),
    stepAForm: byId("step-a-form"),
    bookingPanel: document.querySelector(".booking-panel"),
    bookingPanelHead: byId("booking-panel-head"),
    summaryService: byId("summary-service"),
    summaryDuration: byId("summary-duration"),
    summaryFormat: byId("summary-format"),
    summaryTravel: byId("summary-travel"),
    summaryTotal: byId("summary-total"),
    summaryNote: byId("summary-note"),
    membershipNote: byId("membership-note"),
    bookingConfirmation: byId("booking-confirmation"),
    bookingMethod: byId("booking-method"),
    bookingArrangement: byId("booking-arrangement"),
    bookingReference: byId("booking-reference"),
    newBooking: byId("new-booking"),
    resetDemo: byId("reset-demo"),
    dialog: byId("payment-dialog"),
    checkoutForm: byId("checkout-form"),
    checkoutClose: byId("checkout-close"),
    checkoutSummaryLabel: byId("checkout-summary-label"),
    checkoutTotal: byId("checkout-total"),
    checkoutPay: byId("checkout-pay"),
    checkoutPayAmount: byId("checkout-pay-amount"),
    checkoutProcessorError: byId("processor-error"),
    checkoutError: byId("checkout-error"),
    checkoutProcessing: byId("checkout-processing")
  };

  const bookingFields = [
    "service-select",
    "group-size",
    "booking-name",
    "booking-email",
    "booking-address",
    "booking-miles",
    "booking-consent"
  ];

  let payment = normalizePayment(readStore(STORAGE_KEYS.payment));
  let booking = normalizeBooking(readStore(STORAGE_KEYS.booking));

  if (!payment || !booking) {
    payment = null;
    booking = null;
  }

  function readStore(key) {
    try {
      const raw = storageWorking ? window.localStorage.getItem(key) : memoryStore.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      storageWorking = false;
      const raw = memoryStore.get(key);
      return raw ? JSON.parse(raw) : null;
    }
  }

  function writeStore(key, value) {
    const raw = JSON.stringify(value);
    if (storageWorking) {
      try {
        window.localStorage.setItem(key, raw);
        return;
      } catch (error) {
        storageWorking = false;
      }
    }
    memoryStore.set(key, raw);
  }

  function removeStore(key) {
    if (storageWorking) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        storageWorking = false;
      }
    }
    memoryStore.delete(key);
  }

  function removeLegacyData() {
    LEGACY_STORAGE_KEYS.forEach(removeStore);
  }

  function normalizePayment(value) {
    if (!value || typeof value !== "object" || !value.receipt) {
      return null;
    }
    if (!PROCESSORS.includes(value.method)) {
      return null;
    }
    if (!SERVICE_NAMES[value.service] || !["online", "in-person"].includes(value.mode)) {
      return null;
    }
    return Number.isFinite(Number(value.total)) ? value : null;
  }

  function normalizeBooking(value) {
    if (!value || typeof value !== "object" || !value.reference) {
      return null;
    }
    if (!PROCESSORS.includes(value.method)) {
      return null;
    }
    if (!SERVICE_NAMES[value.service] || !["online", "in-person"].includes(value.mode)) {
      return null;
    }
    return Number.isFinite(Number(value.total)) ? value : null;
  }

  function formatMoney(value) {
    const amount = Number(value);
    return moneyFormatter.format(Number.isFinite(amount) ? amount : 0);
  }

  function makeReference() {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `SWU-${suffix}`;
  }

  function announce(message) {
    window.clearTimeout(announceTimer);
    refs.liveRegion.textContent = "";
    announceTimer = window.setTimeout(() => {
      refs.liveRegion.textContent = message;
    }, 40);
  }

  function setFieldError(id, message) {
    const input = byId(id);
    const output = byId(`${id}-error`);
    if (!input || !output) {
      return;
    }
    output.textContent = message || "";
    const field = input.closest(".field");
    if (field) {
      field.classList.toggle("has-error", Boolean(message));
    }
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function clearFieldError(id) {
    setFieldError(id, "");
  }

  function clearFieldErrors(ids) {
    ids.forEach(clearFieldError);
  }

  function bindFieldClear(id, eventName = "input") {
    const input = byId(id);
    if (!input) {
      return;
    }
    input.addEventListener(eventName, () => clearFieldError(id));
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function setProgress(complete) {
    refs.progressA.classList.toggle("is-complete", complete);
    refs.progressA.classList.toggle("is-current", !complete);
    if (complete) {
      refs.progressA.removeAttribute("aria-current");
    } else {
      refs.progressA.setAttribute("aria-current", "step");
    }
  }

  function getMode() {
    return refs.modeRadios.find((radio) => radio.checked)?.value || "";
  }

  function getModeLabel(mode) {
    if (mode === "online") {
      return "Online, by video";
    }
    if (mode === "in-person") {
      return "In person, at your home";
    }
    return "Choose a format";
  }

  function getPricing() {
    const option = refs.serviceSelect.selectedOptions[0];
    const service = refs.serviceSelect.value;
    const group = service === "group";
    const mode = getMode();
    const basePrice = Number(option?.dataset.price || 0);
    const parsedGroup = Number.parseInt(refs.groupSize.value, 10);
    const groupSize = Number.isInteger(parsedGroup) && parsedGroup > 0 ? parsedGroup : 3;
    const parsedMiles = Number.parseInt(refs.bookingMiles.value, 10);
    const miles =
      mode === "in-person" && Number.isInteger(parsedMiles) && parsedMiles >= 0 && parsedMiles <= MAX_MILES
        ? parsedMiles
        : 0;
    const sessionAmount = basePrice * (group ? groupSize : 1);
    const travelFee = miles * TRAVEL_RATE;

    return {
      service,
      serviceName: SERVICE_NAMES[service] || "Session",
      duration: option?.dataset.duration || "",
      group,
      groupSize,
      mode,
      miles,
      basePrice,
      sessionAmount,
      travelFee,
      total: sessionAmount + travelFee
    };
  }

  function updateSummaryNote() {
    if (booking) {
      refs.summaryNote.textContent = `Booking confirmed · Paid via ${booking.method} · Reference ${booking.reference}.`;
      return;
    }
    refs.summaryNote.textContent = "Payment is required to reserve the time.";
  }

  function updateSummary() {
    const pricing = getPricing();
    refs.summaryService.textContent = pricing.group
      ? `${pricing.serviceName} · ${pricing.groupSize} people`
      : pricing.serviceName;
    refs.summaryDuration.textContent = pricing.duration;
    refs.summaryFormat.textContent = getModeLabel(pricing.mode);
    refs.summaryTravel.textContent = pricing.travelFee
      ? `${formatMoney(pricing.travelFee)} · ${pricing.miles} mi beyond 25`
      : pricing.mode === "in-person"
        ? "Included"
        : pricing.mode === "online"
          ? "No travel fee"
          : "Included";
    refs.summaryTotal.textContent = formatMoney(pricing.total);
    updateSummaryNote();
  }

  function updateGroupVisibility() {
    const isGroup = refs.serviceSelect.value === "group";
    refs.groupSizeWrap.hidden = !isGroup;
    refs.groupSize.required = isGroup;
    refs.groupSize.disabled = !isGroup;
    if (!isGroup) {
      clearFieldError("group-size");
    }
  }

  function clearModeError() {
    refs.modeError.textContent = "";
    refs.modeFieldset.classList.remove("has-error");
    refs.modeRadios.forEach((radio) => radio.removeAttribute("aria-invalid"));
  }

  function setProcessorError(message) {
    refs.checkoutProcessorError.textContent = message || "";
    const fieldset = refs.checkoutForm.querySelector(".processor-fieldset");
    if (fieldset) {
      fieldset.classList.toggle("has-error", Boolean(message));
    }
    all('input[name="processor"]', refs.checkoutForm).forEach((radio) => {
      if (message) {
        radio.setAttribute("aria-invalid", "true");
      } else {
        radio.removeAttribute("aria-invalid");
      }
    });
  }

  function updateModeUI() {
    const mode = getMode();
    const inPerson = mode === "in-person";
    const online = mode === "online";

    refs.inPersonFields.hidden = !inPerson;
    refs.onlineNote.hidden = !online;
    refs.bookingAddress.required = inPerson;
    refs.bookingAddress.disabled = !inPerson;
    refs.bookingMiles.disabled = !inPerson;

    if (!inPerson) {
      clearFieldError("booking-address");
      clearFieldError("booking-miles");
    }

    if (mode) {
      clearModeError();
    }

    updateSummary();
  }

  function validateStepA() {
    clearFieldErrors(bookingFields);
    clearModeError();
    let firstInvalid = null;

    const fail = (id, message) => {
      setFieldError(id, message);
      if (!firstInvalid) {
        firstInvalid = byId(id);
      }
    };

    const service = refs.serviceSelect.value;
    const option = refs.serviceSelect.selectedOptions[0];
    const isGroup = service === "group";
    const mode = getMode();
    let groupSize = null;

    if (!SERVICE_NAMES[service]) {
      fail("service-select", "Please choose a session.");
    }

    if (isGroup) {
      const rawGroup = refs.groupSize.value.trim();
      const parsedGroup = Number(rawGroup);
      if (!/^\d+$/.test(rawGroup) || parsedGroup < 3 || parsedGroup > 8) {
        fail("group-size", "Choose a group of 3 to 8 people.");
      } else {
        groupSize = parsedGroup;
      }
    }

    if (!mode) {
      refs.modeFieldset.classList.add("has-error");
      refs.modeError.textContent = "Choose online or in person.";
      refs.modeRadios.forEach((radio) => radio.setAttribute("aria-invalid", "true"));
      if (!firstInvalid) {
        firstInvalid = refs.modeRadios[0];
      }
    }

    const name = refs.bookingName.value.trim();
    const email = refs.bookingEmail.value.trim();
    const address = mode === "in-person" ? refs.bookingAddress.value.trim() : "";
    const rawMiles = mode === "in-person" ? refs.bookingMiles.value.trim() : "";
    let miles = 0;

    if (!name) {
      fail("booking-name", "Please tell me your name.");
    }
    if (!email) {
      fail("booking-email", "Please add an email address.");
    } else if (!isValidEmail(email)) {
      fail("booking-email", "That email address doesn't look right.");
    }
    if (mode === "in-person" && !address) {
      fail("booking-address", "Please add the full address for the visit.");
    }
    if (rawMiles) {
      const parsedMiles = Number(rawMiles);
      if (!/^\d+$/.test(rawMiles) || parsedMiles > MAX_MILES) {
        fail("booking-miles", "Enter a whole number of miles up to 500.");
      } else {
        miles = parsedMiles;
      }
    }
    if (!refs.bookingConsent.checked) {
      fail("booking-consent", "Please confirm that you've read the cancellation policy.");
    }

    if (firstInvalid) {
      firstInvalid.focus();
      announce("Please check the highlighted booking fields.");
      return null;
    }

    const basePrice = Number(option?.dataset.price || 0);
    const sessionAmount = basePrice * (isGroup ? groupSize : 1);
    const travelFee = miles * TRAVEL_RATE;

    return {
      service,
      serviceName: SERVICE_NAMES[service],
      duration: option?.dataset.duration || "",
      group: isGroup,
      groupSize,
      mode,
      miles,
      baseAmount: sessionAmount,
      travelFee,
      total: sessionAmount + travelFee,
      name,
      email,
      address
    };
  }

  function updateCheckoutCopy(data) {
    const serviceLabel = data.group
      ? `${data.serviceName} · ${data.groupSize} people`
      : data.serviceName;
    refs.checkoutSummaryLabel.textContent = `${serviceLabel} · ${data.duration} · ${getModeLabel(data.mode)}`;
    refs.checkoutTotal.textContent = formatMoney(data.total);
    refs.checkoutPayAmount.textContent = formatMoney(data.total);
  }

  function resetCheckoutView() {
    refs.checkoutForm.hidden = false;
    refs.checkoutProcessing.hidden = true;
    refs.checkoutPay.disabled = false;
    refs.dialog.removeAttribute("aria-busy");
    refs.checkoutForm.reset();
    setProcessorError("");
    refs.checkoutError.textContent = "";
  }

  function focusFirstProcessor() {
    const firstRadio = refs.checkoutForm.querySelector('input[name="processor"]');
    firstRadio?.focus();
  }

  function openCheckout() {
    if (!pendingCheckout) {
      return;
    }

    updateCheckoutCopy(pendingCheckout);
    resetCheckoutView();

    if (typeof refs.dialog.showModal === "function") {
      if (!refs.dialog.open) {
        refs.dialog.showModal();
      }
    } else {
      refs.dialog.setAttribute("open", "");
    }

    document.body.classList.add("has-dialog");
    window.setTimeout(() => {
      if (refs.dialog.open) {
        focusFirstProcessor();
      }
    }, 30);
  }

  function closeCheckout() {
    if (paymentProcessing) {
      return;
    }

    if (refs.dialog.open) {
      if (typeof refs.dialog.close === "function") {
        refs.dialog.close();
      } else {
        refs.dialog.removeAttribute("open");
        document.body.classList.remove("has-dialog");
      }
    } else if (refs.dialog.hasAttribute("open")) {
      refs.dialog.removeAttribute("open");
      document.body.classList.remove("has-dialog");
    }
  }

  function handleStepASubmit(event) {
    event.preventDefault();
    const data = validateStepA();
    if (!data) {
      return;
    }

    pendingCheckout = data;
    openCheckout();
  }

  function processPayment(method) {
    if (!pendingCheckout || paymentProcessing) {
      return;
    }

    paymentProcessing = true;
    window.clearTimeout(paymentTimer);
    refs.checkoutForm.hidden = true;
    refs.checkoutProcessing.hidden = false;
    refs.checkoutError.textContent = "";
    setProcessorError("");
    refs.checkoutPay.disabled = true;
    refs.dialog.setAttribute("aria-busy", "true");

    paymentTimer = window.setTimeout(() => {
      if (!pendingCheckout) {
        paymentProcessing = false;
        return;
      }

      // Skrill/Neteller account details are handled out of band and never rendered or stored.
      const reference = makeReference();
      const paidAt = new Date().toISOString();

      payment = {
        service: pendingCheckout.service,
        serviceName: pendingCheckout.serviceName,
        duration: pendingCheckout.duration,
        group: pendingCheckout.group,
        groupSize: pendingCheckout.groupSize,
        mode: pendingCheckout.mode,
        miles: pendingCheckout.miles,
        travelFee: pendingCheckout.travelFee,
        total: pendingCheckout.total,
        method,
        receipt: reference,
        paidAt
      };
      booking = {
        reference,
        service: pendingCheckout.service,
        serviceName: pendingCheckout.serviceName,
        duration: pendingCheckout.duration,
        groupSize: pendingCheckout.groupSize,
        mode: pendingCheckout.mode,
        miles: pendingCheckout.miles,
        travelFee: pendingCheckout.travelFee,
        total: pendingCheckout.total,
        method,
        createdAt: paidAt
      };

      writeStore(STORAGE_KEYS.payment, payment);
      writeStore(STORAGE_KEYS.booking, booking);
      pendingCheckout = null;
      paymentProcessing = false;

      refs.checkoutProcessing.hidden = true;
      refs.checkoutForm.hidden = false;
      refs.checkoutForm.reset();
      refs.dialog.removeAttribute("aria-busy");
      closeCheckout();
      renderBooking();
      refs.bookingConfirmation.focus({ preventScroll: true });
      scrollToElement(refs.bookingConfirmation);
      announce(`Payment received via ${method}. Your booking is confirmed.`);
    }, PAYMENT_DELAY);
  }

  function handleCheckoutSubmit(event) {
    event.preventDefault();
    if (!pendingCheckout) {
      refs.checkoutError.textContent = "Your checkout expired. Close this window and try again.";
      return;
    }

    const selected = refs.checkoutForm.querySelector('input[name="processor"]:checked');
    setProcessorError("");
    refs.checkoutError.textContent = "";

    if (!selected) {
      setProcessorError("Choose Skrill or Neteller.");
      focusFirstProcessor();
      return;
    }

    processPayment(selected.value);
  }

  function scrollToElement(element, block = "center") {
    if (!element) {
      return;
    }
    element.scrollIntoView({
      behavior: reducedMotion.matches ? "auto" : "smooth",
      block
    });
  }

  function renderBooking() {
    const confirmed = Boolean(payment && booking);
    refs.stepAForm.hidden = confirmed;
    refs.bookingPanelHead.hidden = confirmed;
    refs.membershipNote.hidden = confirmed;
    refs.bookingConfirmation.hidden = !confirmed;
    refs.bookingPanel.setAttribute(
      "aria-labelledby",
      confirmed ? "confirmation-title" : "step-a-title"
    );
    setProgress(confirmed);

    if (!confirmed) {
      updateGroupVisibility();
      updateModeUI();
      return;
    }

    const serviceLabel = booking.groupSize
      ? `${booking.serviceName} · ${booking.groupSize} people`
      : booking.serviceName;
    refs.summaryService.textContent = serviceLabel;
    refs.summaryDuration.textContent = booking.duration;
    refs.summaryFormat.textContent = getModeLabel(booking.mode);
    refs.summaryTravel.textContent = booking.travelFee
      ? `${formatMoney(booking.travelFee)} · ${booking.miles} mi beyond 25`
      : booking.mode === "in-person"
        ? "Included"
        : "No travel fee";
    refs.summaryTotal.textContent = formatMoney(booking.total);
    refs.bookingMethod.textContent = booking.method;
    refs.bookingArrangement.textContent = booking.mode === "online" ? "video link" : "visit details";
    refs.bookingReference.textContent = booking.reference;
    updateSummaryNote();
  }

  function resetTransaction(focusStepA = true) {
    window.clearTimeout(paymentTimer);
    paymentProcessing = false;
    pendingCheckout = null;
    removeStore(STORAGE_KEYS.payment);
    removeStore(STORAGE_KEYS.booking);
    payment = null;
    booking = null;

    refs.stepAForm.reset();
    refs.checkoutForm.reset();
    clearFieldErrors(bookingFields);
    clearModeError();
    setProcessorError("");
    refs.checkoutError.textContent = "";
    renderBooking();

    if (focusStepA) {
      refs.serviceSelect.focus({ preventScroll: true });
      scrollToElement(refs.serviceSelect.closest(".booking-panel"));
      announce("Ready for another booking. Choose a session and a format.");
    }
  }

  function resetDemo() {
    window.clearTimeout(paymentTimer);
    window.clearTimeout(announceTimer);
    pendingCheckout = null;
    paymentProcessing = false;
    closeCheckout();
    resetCheckoutView();
    removeLegacyData();
    resetTransaction(false);
    refs.serviceSelect.focus({ preventScroll: true });
    scrollToElement(refs.serviceSelect.closest(".booking-panel"));
    announce("Demo data cleared. The booking form is ready.");
  }

  function openMenu() {
    refs.navMenu.classList.add("is-open");
    refs.navToggle.setAttribute("aria-expanded", "true");
  }

  function closeMenu(returnFocus = false) {
    refs.navMenu.classList.remove("is-open");
    refs.navToggle.setAttribute("aria-expanded", "false");
    if (returnFocus) {
      refs.navToggle.focus();
    }
  }

  function setupNavigation() {
    refs.navToggle.addEventListener("click", () => {
      if (refs.navMenu.classList.contains("is-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    refs.navMenu.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        closeMenu();
      }
    });

    document.addEventListener("click", (event) => {
      if (!refs.navMenu.classList.contains("is-open")) {
        return;
      }
      if (event.target.closest(".site-nav")) {
        return;
      }
      closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && refs.navMenu.classList.contains("is-open")) {
        closeMenu(true);
      }
    });

    const mobileQuery = window.matchMedia("(max-width: 960px)");
    const handleQueryChange = (event) => {
      if (!event.matches) {
        closeMenu();
      }
    };

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", handleQueryChange);
    } else {
      mobileQuery.addListener(handleQueryChange);
    }
  }

  function setupFaq() {
    const items = all(".faq-item");
    items.forEach((item) => {
      item.addEventListener("toggle", () => {
        if (!item.open) {
          return;
        }
        items.forEach((other) => {
          if (other !== item) {
            other.open = false;
          }
        });
      });
    });
  }

  function setupServiceLinks() {
    all(".js-book").forEach((link) => {
      link.addEventListener("click", () => {
        if (payment || booking) {
          return;
        }
        const service = link.dataset.service;
        if (!SERVICE_NAMES[service]) {
          return;
        }
        refs.serviceSelect.value = service;
        clearFieldError("service-select");
        updateGroupVisibility();
        updateSummary();
      });
    });
  }

  function setupFieldClearing() {
    ["booking-name", "booking-email", "booking-address"].forEach((id) => bindFieldClear(id));
    bindFieldClear("booking-consent", "change");
    bindFieldClear("group-size");
    bindFieldClear("booking-miles");

    refs.modeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        clearModeError();
        updateModeUI();
      });
    });

    all('input[name="processor"]', refs.checkoutForm).forEach((radio) => {
      radio.addEventListener("change", () => {
        setProcessorError("");
      });
    });
  }

  function setupCheckoutDialog() {
    refs.checkoutClose.addEventListener("click", closeCheckout);
    refs.checkoutForm.addEventListener("submit", handleCheckoutSubmit);

    refs.dialog.addEventListener("cancel", (event) => {
      if (paymentProcessing) {
        event.preventDefault();
      }
    });

    refs.dialog.addEventListener("click", (event) => {
      if (event.target === refs.dialog && !paymentProcessing) {
        closeCheckout();
      }
    });

    refs.dialog.addEventListener("close", () => {
      document.body.classList.remove("has-dialog");
    });
  }

  function setupForms() {
    refs.stepAForm.addEventListener("submit", handleStepASubmit);
    refs.newBooking.addEventListener("click", () => resetTransaction(true));
    refs.resetDemo.addEventListener("click", resetDemo);

    refs.serviceSelect.addEventListener("change", () => {
      clearFieldError("service-select");
      updateGroupVisibility();
      updateSummary();
    });
    refs.groupSize.addEventListener("input", updateSummary);
    refs.bookingMiles.addEventListener("input", updateSummary);
  }

  function init() {
    removeLegacyData();
    setupNavigation();
    setupFaq();
    setupServiceLinks();
    setupFieldClearing();
    setupCheckoutDialog();
    setupForms();
    renderBooking();
  }

  init();
})();
