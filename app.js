const data = window.CASE_DATA;
const ALL = "不限";

const teacherInput = document.querySelector("#teacherInput");
const scoreInput = document.querySelector("#scoreInput");
const provinceInput = document.querySelector("#provinceInput");
const teacherMenu = document.querySelector("#teacherMenu");
const scoreMenu = document.querySelector("#scoreMenu");
const provinceMenu = document.querySelector("#provinceMenu");
const profileGrid = document.querySelector("#profileGrid");
const caseGrid = document.querySelector("#caseGrid");
const teacherMeta = document.querySelector("#teacherMeta");
const resultMeta = document.querySelector("#resultMeta");
const emptyState = document.querySelector("#emptyState");
const toast = document.querySelector("#toast");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxCaption = document.querySelector("#lightboxCaption");
const lightboxClose = document.querySelector("#lightboxClose");

const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
const subjectOrder = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];
const teachers = [...data.teachers].sort((a, b) => {
  const subjectRankA = subjectOrder.indexOf(a.subject);
  const subjectRankB = subjectOrder.indexOf(b.subject);
  const rankA = subjectRankA === -1 ? subjectOrder.length : subjectRankA;
  const rankB = subjectRankB === -1 ? subjectOrder.length : subjectRankB;
  return rankA - rankB || collator.compare(a.name, b.name);
});
let activeTeacher = teachers[0];

const ANALYTICS_CONTEXT = {
  project_name: "提分案例筛选页",
  module_name: "teacher-score-case",
};

function trackEvent(eventName, properties = {}) {
  if (!window.posthog || typeof window.posthog.capture !== "function") return;

  window.posthog.capture(eventName, {
    ...ANALYTICS_CONTEXT,
    page_title: document.title,
    page_path: window.location.pathname,
    ...properties,
  });
}

function teacherAnalytics(teacher) {
  return {
    teacher: teacher.name,
    subject: teacher.subject || "",
  };
}

function filterAnalytics(teacher) {
  return {
    ...teacherAnalytics(teacher),
    score_band: scoreInput.value.trim() || ALL,
    province: provinceInput.value.trim() || ALL,
  };
}

function imageAnalytics(item, context = {}) {
  return {
    image_name: item.name || "",
    image_src: item.src || "",
    province: item.province || context.province || "",
    score_band: item.band || context.score_band || "",
    score_text: item.scoreText || "",
    content_type: context.content_type || "image",
    ...context,
  };
}

function teacherLabel(teacher) {
  return `${teacher.name}${teacher.subject ? `（${teacher.subject}）` : ""}`;
}

function getTeacherFromInput() {
  const value = teacherInput.value.trim();
  return teachers.find((teacher) => teacherLabel(teacher) === value || teacher.name === value) || activeTeacher;
}

function setMenu(menu, options, onPick) {
  menu.innerHTML = "";
  options.forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "combo-option";
    item.textContent = option.label || option;
    item.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      onPick(option.value || option);
      syncActiveOptions(menu.closest(".combo"));
      closeMenus();
    });
    menu.appendChild(item);
  });
}

function closeMenus() {
  document.querySelectorAll(".combo.open").forEach((combo) => combo.classList.remove("open"));
}

function openMenu(combo) {
  closeMenus();
  syncActiveOptions(combo);
  combo.classList.add("open");
}

function syncActiveOptions(combo) {
  const input = combo.querySelector("input");
  const current = input.value.trim();
  combo.querySelectorAll(".combo-option").forEach((item) => {
    item.classList.toggle("active", item.textContent.trim() === current);
  });
}

function filterMenu(menu, query) {
  const keyword = query.trim();
  [...menu.children].forEach((item) => {
    item.hidden = keyword && !item.textContent.includes(keyword);
  });
}

function updateTeacherMenu() {
  setMenu(teacherMenu, teachers.map((teacher) => ({ label: teacherLabel(teacher), value: teacherLabel(teacher) })), (value) => {
    teacherInput.value = value;
    const selectedTeacher = getTeacherFromInput();
    trackEvent("teacher_option_clicked", teacherAnalytics(selectedTeacher));
    applyTeacherChange("teacher_menu");
  });
}

function updateScoreMenu(teacher) {
  const options = [ALL, ...teacher.scoreBands.map((band) => band.name)];
  setMenu(scoreMenu, options, (value) => {
    scoreInput.value = value;
    trackEvent("score_filter_changed", filterAnalytics(activeTeacher));
    renderCases(activeTeacher);
  });
  if (!options.includes(scoreInput.value.trim())) scoreInput.value = ALL;
}

function updateProvinceMenu() {
  setMenu(provinceMenu, [ALL, ...data.provinces], (value) => {
    provinceInput.value = value;
    trackEvent("province_filter_changed", filterAnalytics(activeTeacher));
    renderCases(activeTeacher);
  });
}

function imageCard(item, title, meta = "", context = {}) {
  const card = document.createElement("article");
  card.className = "image-card";

  const preview = document.createElement("button");
  preview.className = "image-wrap";
  preview.type = "button";
  preview.addEventListener("click", () => openLightbox(item, meta || title, context));

  const image = document.createElement("img");
  image.src = item.src;
  image.alt = title;
  image.loading = "lazy";
  preview.appendChild(image);

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const name = document.createElement("div");
  name.className = "case-title";
  name.title = meta || title;
  name.textContent = meta || title;

  const button = document.createElement("button");
  button.className = "copy-btn";
  button.type = "button";
  button.title = "复制素材";
  button.setAttribute("aria-label", "复制素材");
  button.addEventListener("click", () => copyImage(item, button, context));

  footer.append(name, button);
  card.append(preview, footer);
  return card;
}

function renderProfiles(teacher) {
  profileGrid.innerHTML = "";
  teacher.profileImages.forEach((item) => {
    profileGrid.appendChild(imageCard(item, item.name, `${teacher.name}｜${item.name}`, {
      ...teacherAnalytics(teacher),
      content_type: "teacher_profile",
    }));
  });
  teacherMeta.textContent = `${teacher.name}｜${teacher.subject || "学科"}｜共 ${teacher.profileImages.length} 张海报`;
}

function matchedCases(teacher) {
  const score = scoreInput.value.trim() || ALL;
  const province = provinceInput.value.trim() || ALL;
  const bands = score === ALL ? teacher.scoreBands : teacher.scoreBands.filter((band) => band.name === score);

  return bands
    .flatMap((band) => band.cases.map((item) => ({ ...item, band: band.name })))
    .filter((item) => province === ALL || item.province === province);
}

function renderCases(teacher) {
  const cases = matchedCases(teacher);
  const score = scoreInput.value.trim() || ALL;
  const province = provinceInput.value.trim() || ALL;

  caseGrid.innerHTML = "";
  cases.forEach((item) => {
    const provinceText = item.province || "未标省份";
    const meta = `${teacher.name}｜${provinceText}｜${item.scoreText}`;
    caseGrid.appendChild(imageCard(item, item.name, meta, {
      ...teacherAnalytics(teacher),
      content_type: "score_case",
      province: provinceText,
      score_band: item.band,
      score_text: item.scoreText,
    }));
  });

  emptyState.hidden = cases.length !== 0;
  const scoreText = score === ALL ? "全部分数段" : score;
  const provinceText = province === ALL ? "全国" : province;
  resultMeta.textContent = `已匹配：${teacher.name} / ${scoreText} / ${provinceText}，共找到 ${cases.length} 条结果`;
}

function applyTeacherChange(source = "manual") {
  const nextTeacher = getTeacherFromInput();
  const changed = nextTeacher.name !== activeTeacher.name || nextTeacher.subject !== activeTeacher.subject;
  activeTeacher = nextTeacher;
  teacherInput.value = teacherLabel(activeTeacher);
  updateScoreMenu(activeTeacher);
  renderProfiles(activeTeacher);
  renderCases(activeTeacher);

  if (changed) {
    trackEvent("teacher_selected", {
      ...teacherAnalytics(activeTeacher),
      source,
    });
  }
}

function resetFilters() {
  activeTeacher = teachers[0];
  teacherInput.value = teacherLabel(activeTeacher);
  scoreInput.value = ALL;
  provinceInput.value = ALL;
  updateScoreMenu(activeTeacher);
  renderProfiles(activeTeacher);
  renderCases(activeTeacher);
  trackEvent("filters_reset_clicked", filterAnalytics(activeTeacher));
}

function openLightbox(item, caption, context = {}) {
  trackEvent("image_clicked", imageAnalytics(item, context));
  lightboxImage.src = item.src;
  lightboxImage.alt = caption;
  lightboxCaption.textContent = caption;
  lightbox.setAttribute("aria-hidden", "false");
  lightbox.classList.add("open");
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.removeAttribute("src");
}

async function copyImage(item, button, context = {}) {
  const properties = imageAnalytics(item, context);
  trackEvent("image_copy_clicked", properties);
  button.classList.add("copying");

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const response = await fetch(item.src);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      showToast("图片已复制");
    } else {
      await navigator.clipboard.writeText(item.absolutePath || item.src);
      showToast("已复制图片路径");
    }
    trackEvent("image_copy_succeeded", properties);
  } catch (error) {
    await navigator.clipboard.writeText(item.absolutePath || decodeURIComponent(item.src));
    showToast("浏览器限制图片复制，已复制路径");
    trackEvent("image_copy_fallback_used", {
      ...properties,
      error_message: error.message || "",
    });
  } finally {
    button.classList.remove("copying");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function bindCombo(input, menu) {
  const combo = input.closest(".combo");
  combo.querySelector(".combo-toggle").addEventListener("click", () => {
    combo.classList.contains("open") ? closeMenus() : openMenu(combo);
    input.focus();
  });
  input.addEventListener("focus", () => openMenu(combo));
  input.addEventListener("input", () => filterMenu(menu, input.value));
}

function init() {
  updateTeacherMenu();
  updateProvinceMenu();
  teacherInput.value = teacherLabel(activeTeacher);
  scoreInput.value = ALL;
  provinceInput.value = ALL;
  updateScoreMenu(activeTeacher);
  renderProfiles(activeTeacher);
  renderCases(activeTeacher);
  trackEvent("tool_page_viewed", {
    ...teacherAnalytics(activeTeacher),
    total_teachers: teachers.length,
  });

  bindCombo(teacherInput, teacherMenu);
  bindCombo(scoreInput, scoreMenu);
  bindCombo(provinceInput, provinceMenu);

  document.querySelector("#searchBtn").addEventListener("click", () => {
    applyTeacherChange("search_button");
    trackEvent("filter_search_clicked", {
      ...filterAnalytics(activeTeacher),
      result_count: matchedCases(activeTeacher).length,
    });
  });
  document.querySelector("#resetBtn").addEventListener("click", resetFilters);
  teacherInput.addEventListener("change", () => applyTeacherChange("teacher_input_change"));
  scoreInput.addEventListener("change", () => {
    closeMenus();
    trackEvent("score_filter_changed", filterAnalytics(activeTeacher));
    renderCases(activeTeacher);
  });
  provinceInput.addEventListener("change", () => {
    closeMenus();
    trackEvent("province_filter_changed", filterAnalytics(activeTeacher));
    renderCases(activeTeacher);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".combo")) closeMenus();
    if (event.target === lightbox) closeLightbox();
  });
  lightboxClose.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenus();
      closeLightbox();
    }
    if (event.key === "Enter" && document.activeElement.matches("#teacherInput, #scoreInput, #provinceInput")) {
      applyTeacherChange("keyboard_enter");
      trackEvent("filter_search_submitted", {
        ...filterAnalytics(activeTeacher),
        result_count: matchedCases(activeTeacher).length,
      });
      closeMenus();
    }
  });
}

init();
