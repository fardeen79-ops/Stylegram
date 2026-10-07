// Interface language (English / Arabic). Strings are keyed by their English text, so anything
// missing from the Arabic dictionary falls back to English instead of breaking.

export const LANGUAGES = {
  en: { name: "English", dir: "ltr", locale: "en-AE" },
  ar: { name: "العربية", dir: "rtl", locale: "ar-AE" },
};

let current = "en";

export const getLang = () => current;
export const locale = () => LANGUAGES[current].locale;

export function setLang(lang) {
  current = LANGUAGES[lang] ? lang : "en";
  document.documentElement.lang = current;
  document.documentElement.dir = LANGUAGES[current].dir;
}

/** Translate an interface string; `{name}` placeholders are filled from `vars` (pass pre-escaped HTML). */
export function t(text, vars = {}) {
  const s = current === "ar" ? (AR[text] ?? text) : text;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Count + noun with correct plural form, e.g. tn("like", 3) → "3 likes" / "3 إعجابات". */
export function tn(word, count, formatted = String(count)) {
  const forms = PLURALS[word]?.[current] ?? PLURALS[word]?.en;
  if (!forms) return `${formatted} ${word}`;
  const cat = new Intl.PluralRules(current).select(count);
  const pick = forms[count === 0 && forms.zero ? "zero" : cat] ?? forms.other;
  return pick.replace("{n}", formatted);
}

/** Plural label without the number (profile stats show the number separately). */
export function tl(word, count) {
  const forms = LABELS[word]?.[current] ?? LABELS[word]?.en;
  if (!forms) return word;
  return forms[new Intl.PluralRules(current).select(count)] ?? forms.other;
}

const CATEGORY_AR = {
  top: "بلوزات وقمصان", bottom: "بناطيل وتنانير", dress: "فساتين", abaya: "عبايات", kandura: "كنادير",
  outerwear: "جاكيتات ومعاطف", shoes: "أحذية", bag: "حقائب", scarf: "شيلات وأوشحة", hat: "قبعات",
  eyewear: "نظارات", jewelry: "مجوهرات", watch: "ساعات", accessory: "إكسسوارات", other: "أخرى",
};
/** Display name of a product category code. */
export const catLabel = (c) => (current === "ar" ? (CATEGORY_AR[c] ?? c) : c);

const PLURALS = {
  like: {
    en: { one: "{n} like", other: "{n} likes" },
    ar: { zero: "لا إعجابات", one: "إعجاب واحد", two: "إعجابان", few: "{n} إعجابات", many: "{n} إعجابًا", other: "{n} إعجاب" },
  },
  other: {
    en: { one: "{n} other", other: "{n} others" },
    ar: { one: "شخص آخر", two: "شخصين آخرين", few: "{n} أشخاص آخرين", many: "{n} شخصًا آخر", other: "{n} شخص آخر" },
  },
};

const LABELS = {
  posts: { en: { one: "post", other: "posts" }, ar: { one: "منشور", two: "منشوران", few: "منشورات", many: "منشورًا", other: "منشور", zero: "منشور" } },
  followers: { en: { one: "follower", other: "followers" }, ar: { one: "متابِع", two: "متابِعان", few: "متابِعين", many: "متابِعًا", other: "متابِع", zero: "متابِع" } },
  following: { en: { other: "following" }, ar: { other: "يتابِع" } },
  looks: { en: { one: "look", other: "looks" }, ar: { other: "إطلالات" } },
  "tagged items": { en: { one: "tagged item", other: "tagged items" }, ar: { other: "عناصر موسومة" } },
  products: { en: { one: "product", other: "products" }, ar: { other: "منتجات" } },
};

// Short relative times ("3h") for post headers.
export const SHORT_UNITS = {
  en: { y: "y", w: "w", d: "d", h: "h", m: "m", now: "now" },
  ar: { y: " سنة", w: " أ", d: " ي", h: " س", m: " د", now: "الآن" },
};

/** Messages for server error codes, so errors read in the user's language. */
export const ERROR_MESSAGES = {
  CONTENT_REJECTED: "This photo can't be posted because it appears to contain nudity or sexual content. Stylegram doesn't allow that.",
  AI_UNAVAILABLE: "That isn't available right now. Please try again in a moment.",
  RATE_LIMITED: "You've done that a lot. Try again in a little while.",
};

const AR = {
  // Errors & connectivity
  "This photo can't be posted because it appears to contain nudity or sexual content. Stylegram doesn't allow that.":
    "لا يمكن نشر هذه الصورة لأنها تبدو أنها تحتوي على عُري أو محتوى جنسي، وهذا غير مسموح به في Stylegram.",
  "That isn't available right now. Please try again in a moment.": "هذه الميزة غير متاحة الآن. يُرجى المحاولة بعد قليل.",
  "You've done that a lot. Try again in a little while.": "لقد كررت ذلك كثيرًا. حاول مرة أخرى بعد قليل.",
  "Wrong username or password": "اسم المستخدم أو كلمة المرور غير صحيحة",
  "You're offline. Check your connection and try again.": "أنت غير متصل بالإنترنت. تحقّق من اتصالك وحاول مرة أخرى.",
  "Couldn't reach Stylegram. Check your connection and try again.": "تعذّر الوصول إلى Stylegram. تحقّق من اتصالك وحاول مرة أخرى.",
  "You're offline. Showing what you saw last time.": "أنت غير متصل. نعرض لك ما شاهدته في المرة الأخيرة.",
  "You're offline. Some things won't load until you reconnect.": "أنت غير متصل. لن يتم تحميل بعض المحتوى حتى تعود للاتصال.",
  "Back online.": "عدت إلى الاتصال.",
  "You're offline": "أنت غير متصل",
  "Can't connect right now": "تعذّر الاتصال الآن",
  "This page hasn't been saved for offline use yet. Reconnect to see it.": "لم تُحفظ هذه الصفحة للاستخدام دون اتصال بعد. اتصل بالإنترنت لعرضها.",
  "Stylegram couldn't be reached. Pages you've already seen still open.": "تعذّر الوصول إلى Stylegram. الصفحات التي شاهدتها سابقًا ما زالت متاحة.",
  "Try again": "حاول مرة أخرى",
  "Sorry, this page isn't available.": "عذرًا، هذه الصفحة غير متاحة.",
  "Go back to Stylegram": "العودة إلى Stylegram",

  // Install
  "Stylegram was added to your home screen.": "تمت إضافة Stylegram إلى الشاشة الرئيسية.",
  "Install Stylegram": "تثبيت Stylegram",
  "Open your browser's menu and choose <b>Install app</b> or <b>Add to Home screen</b>. Installing needs a secure (https) address. On your own computer, http://localhost works too.":
    "افتح قائمة المتصفح واختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>. يتطلب التثبيت عنوانًا آمنًا (https)، ويعمل أيضًا http://localhost على جهازك.",
  OK: "حسنًا",
  "Add Stylegram to your Home Screen": "أضِف Stylegram إلى الشاشة الرئيسية",
  "Tap the <b>Share</b> button {icon} in Safari's toolbar.": "اضغط على زر <b>المشاركة</b> {icon} في شريط أدوات Safari.",
  "Scroll down and tap <b>Add to Home Screen</b>.": "مرّر للأسفل واضغط على <b>إضافة إلى الشاشة الرئيسية</b>.",
  "Tap <b>Add</b>. Stylegram opens full-screen, like an app.": "اضغط على <b>إضافة</b>. سيفتح Stylegram بملء الشاشة مثل التطبيق.",
  "Got it": "فهمت",
  Dismiss: "إغلاق",
  "Get the full-screen app on your phone": "احصل على التطبيق بملء الشاشة على هاتفك",
  Install: "تثبيت",
  Add: "إضافة",
  "Install app": "تثبيت التطبيق",
  "Add Stylegram to Home Screen": "إضافة Stylegram إلى الشاشة الرئيسية",

  // Navigation
  Home: "الرئيسية",
  Search: "بحث",
  Explore: "استكشاف",
  Create: "إنشاء",
  Closet: "خزانتي",
  Profile: "الملف الشخصي",
  "Log in": "تسجيل الدخول",
  "Sign up": "إنشاء حساب",
  More: "المزيد",
  "Brand dashboard": "لوحة العلامة التجارية",
  Admin: "الإدارة",
  Settings: "الإعدادات",
  Earnings: "الأرباح",
  "Log out": "تسجيل الخروج",
  Cancel: "إلغاء",

  // Auth
  "Sign up to share your looks and shop what people are wearing.": "سجّل لتشارك إطلالاتك وتتسوّق ما يرتديه الآخرون.",
  Personal: "شخصي",
  Brand: "علامة تجارية",
  Email: "البريد الإلكتروني",
  "Full Name": "الاسم الكامل",
  Username: "اسم المستخدم",
  "Brand name": "اسم العلامة التجارية",
  "Official website (https://…)": "الموقع الرسمي (https://…)",
  "UAE trade licence number (optional)": "رقم الرخصة التجارية في الإمارات (اختياري)",
  "Username or email": "اسم المستخدم أو البريد الإلكتروني",
  Password: "كلمة المرور",
  "People who use our service can see what you post and the brands you tag.": "يمكن لمستخدمي خدمتنا رؤية ما تنشره والعلامات التجارية التي تُشير إليها.",
  "Brand accounts are verified by our team before they can manage products and review tags.":
    "يتحقق فريقنا من حسابات العلامات التجارية قبل أن تتمكن من إدارة المنتجات ومراجعة الإشارات.",
  OR: "أو",
  "Browse without an account": "تصفّح بدون حساب",
  "Have an account? <a class=\"text-btn\" href=\"#/login\">Log in</a>": "لديك حساب؟ <a class=\"text-btn\" href=\"#/login\">تسجيل الدخول</a>",
  "Don't have an account? <a class=\"text-btn\" href=\"#/signup\">Sign up</a>": "ليس لديك حساب؟ <a class=\"text-btn\" href=\"#/signup\">إنشاء حساب</a>",
  "Your claim on this brand is waiting for review": "طلبك لإدارة هذه العلامة التجارية قيد المراجعة",
  "Your brand is waiting for verification": "علامتك التجارية بانتظار التحقق",

  // Posts
  "Photo {n} by {user}": "الصورة {n} من {user}",
  Previous: "السابق",
  Next: "التالي",
  "Show tagged products": "عرض المنتجات المُشار إليها",
  "Liked by {user} and {others}": "أعجب {user} و{others}",
  "Be the first to <span class=\"b\">like this</span>": "كن أول من <span class=\"b\">يُعجب بهذا</span>",
  more: "المزيد",
  "More options": "خيارات أخرى",
  Like: "إعجاب",
  Unlike: "إلغاء الإعجاب",
  Comment: "تعليق",
  Share: "مشاركة",
  "Add to closet": "إضافة إلى الخزانة",
  "Remove from closet": "إزالة من الخزانة",
  "View all {n} comments": "عرض جميع التعليقات ({n})",
  "Add a comment…": "أضف تعليقًا…",
  Post: "نشر",
  "<a class=\"text-btn\" href=\"#/login\">Log in</a> to like or comment.": "<a class=\"text-btn\" href=\"#/login\">سجّل الدخول</a> للإعجاب أو التعليق.",
  "See translation": "عرض الترجمة",
  "See original": "عرض النص الأصلي",
  "Translating…": "جارٍ الترجمة…",
  "Translated from {lang}": "مترجم من {lang}",
  Translated: "مترجم",
  "Verified brand": "علامة تجارية موثّقة",
  "Community brand page": "صفحة علامة تجارية من المجتمع",
  "✓ Confirmed by {brand}": "✓ أكّدتها {brand}",
  "{brand} says this isn't their item": "تقول {brand} إن هذا ليس من منتجاتها",
  "Tagged by the creator · not yet confirmed by the brand": "أشار إليه صاحب المنشور · لم تؤكده العلامة التجارية بعد",
  "View on website": "عرض على الموقع",
  "Shop {brand}": "تسوّق من {brand}",
  "More looks with this item": "إطلالات أخرى بهذا المنتج",
  "See brand page": "صفحة العلامة التجارية",
  Close: "إغلاق",
  "Stylegram and @{user} may earn a commission if you buy through this link.": "قد يحصل Stylegram و@{user} على عمولة إذا اشتريت عبر هذا الرابط.",
  "Stylegram may earn a commission if you buy through this link.": "قد يحصل Stylegram على عمولة إذا اشتريت عبر هذا الرابط.",
  Delete: "حذف",
  Unfollow: "إلغاء المتابعة",
  "Go to post": "الانتقال إلى المنشور",
  "Copy link": "نسخ الرابط",
  "About this account": "عن هذا الحساب",
  "Link copied to clipboard.": "تم نسخ الرابط.",
  "Unfollowed {user}": "ألغيت متابعة {user}",
  "Delete post? This can't be undone.": "هل تريد حذف المنشور؟ لا يمكن التراجع عن ذلك.",
  "Post deleted.": "تم حذف المنشور.",
  "Post by {user}": "منشور من {user}",
  "Added to your closet.": "أُضيف إلى خزانتك.",
  "Removed from your closet.": "أُزيل من خزانتك.",
  "No comments yet.": "لا توجد تعليقات بعد.",
  "Start the conversation.": "ابدأ المحادثة.",
  "just now": "الآن",

  // Home
  Switch: "تبديل",
  "Suggested for you": "مقترح لك",
  "See All": "عرض الكل",
  "About · Help · Brands · Privacy · Terms": "حول · المساعدة · العلامات التجارية · الخصوصية · الشروط",
  Follow: "متابعة",
  Following: "تتابعه",
  "You're following everyone. Nice.": "أنت تتابع الجميع. رائع!",
  "Welcome to Stylegram": "مرحبًا بك في Stylegram",
  "Follow people and brands to see their looks here, or share your own outfit.": "تابِع الأشخاص والعلامات التجارية لرؤية إطلالاتهم هنا، أو شارك إطلالتك.",
  "Share a look": "شارك إطلالة",
  "Popular brand": "علامة تجارية رائجة",
  "Followed by {n} you follow": "يتابعه {n} ممن تتابعهم",

  // Explore
  "Search brands, items, people": "ابحث عن علامات تجارية أو منتجات أو أشخاص",
  "For you": "لك",
  "Looks matching “{q}”": "إطلالات تطابق «{q}»",
  "Looks matching <b>{q}</b>": "إطلالات تطابق <b>{q}</b>",
  "No results found": "لا توجد نتائج",
  "Try a brand name, an item like “sneakers”, or a #hashtag.": "جرّب اسم علامة تجارية أو منتجًا مثل «عباية» أو #وسم.",

  // Post page, closet, profile
  "More posts from {user}": "المزيد من منشورات {user}",
  "Your closet": "خزانتي",
  "Looks you've hung up for later. Only you can see your closet.": "إطلالات علّقتها لوقت لاحق. أنت فقط من يرى خزانتك.",
  "Your closet is empty": "خزانتك فارغة",
  "Tap the hanger on any look to keep it here. Only you can see your closet.": "اضغط على الشمّاعة في أي إطلالة لحفظها هنا. أنت فقط من يرى خزانتك.",
  "Edit profile": "تعديل الملف الشخصي",
  Shop: "تسوّق",
  Options: "خيارات",
  "Shop on Stylegram": "تسوّق على Stylegram",
  Posts: "المنشورات",
  "Share your first look": "شارك أول إطلالة لك",
  "When you share photos and tag what you're wearing, they'll appear on your profile.": "عندما تشارك صورًا وتُشير إلى ما ترتديه، ستظهر في ملفك الشخصي.",
  "Share your first photo": "شارك أول صورة",
  "No posts yet": "لا توجد منشورات بعد",

  // Brand page
  "Visit store": "زيارة المتجر",
  "Created from people's tags. Is this your brand? <a class=\"text-btn\" href=\"#/signup\">Claim it</a>":
    "أُنشئت من إشارات المستخدمين. هل هذه علامتك التجارية؟ <a class=\"text-btn\" href=\"#/signup\">اطلب إدارتها</a>",
  "Seen on": "شوهدت في",
  "Looks with <b>{item}</b>": "إطلالات بـ <b>{item}</b>",
  Buy: "شراء",
  Clear: "مسح",
  "No products yet": "لا توجد منتجات بعد",
  "This brand hasn't added its catalog yet.": "لم تُضِف هذه العلامة التجارية منتجاتها بعد.",
  "Products appear once the brand joins Stylegram.": "تظهر المنتجات عند انضمام العلامة التجارية إلى Stylegram.",
  "No looks yet": "لا توجد إطلالات بعد",
  "Nobody has tagged this yet.": "لم يُشر أحد إلى هذا بعد.",

  // Settings
  "Change photo": "تغيير الصورة",
  Name: "الاسم",
  Bio: "النبذة",
  Language: "اللغة",
  "Posts, comments and bios in other languages can be translated into this language.": "يمكن ترجمة المنشورات والتعليقات والنبذات المكتوبة بلغات أخرى إلى هذه اللغة.",
  Submit: "حفظ",
  "Your claim on <b>{brand}</b> is waiting for review.": "طلبك لإدارة <b>{brand}</b> قيد المراجعة.",
  "<b>{brand}</b> is waiting for verification.": "<b>{brand}</b> بانتظار التحقق.",
  "Profile photo updated.": "تم تحديث صورة الملف الشخصي.",
  "Profile saved.": "تم حفظ الملف الشخصي.",

  // Create
  Back: "رجوع",
  "Create new post": "إنشاء منشور جديد",
  "Drag photos here": "اسحب الصور إلى هنا",
  "Select from device": "اختر من جهازك",
  "Write a caption… Use #hashtags and @mentions": "اكتب وصفًا… استخدم #الوسوم و@الإشارات",
  "Tagged products": "المنتجات المُشار إليها",
  "Photo {n}": "الصورة {n}",
  "Suggested: {item}": "مقترح: {item}",
  "Tag suggested item: {item}": "الإشارة إلى المنتج المقترح: {item}",
  "Checking photo and finding items…": "جارٍ فحص الصورة والبحث عن المنتجات…",
  "Tap a ✦ to tag a suggested item, or tap anywhere": "اضغط على ✦ للإشارة إلى منتج مقترح، أو اضغط في أي مكان",
  "Tap an item to tag its brand": "اضغط على قطعة للإشارة إلى علامتها التجارية",
  "Suggested items": "منتجات مقترحة",
  "Brand unknown": "العلامة غير معروفة",
  Tag: "إشارة",
  "Suggestions are made by AI. Check the brand before tagging.": "الاقتراحات من الذكاء الاصطناعي. تحقّق من العلامة التجارية قبل الإشارة.",
  "Looking for clothes and accessories…": "جارٍ البحث عن الملابس والإكسسوارات…",
  "Checking…": "جارٍ الفحص…",
  "photo {n}": "الصورة {n}",
  "Remove tag": "إزالة الإشارة",
  "Tap the photo where an item is to tag the brand and product.": "اضغط على مكان القطعة في الصورة للإشارة إلى العلامة التجارية والمنتج.",
  "Discard post? If you leave, your edits won't be saved.": "تجاهل المنشور؟ إذا غادرت فلن تُحفظ تعديلاتك.",
  "Use “{name}” (new brand)": "استخدم «{name}» (علامة جديدة)",
  "Brand (e.g. Northwind Denim)": "العلامة التجارية (مثل Northwind Denim)",
  "Product not listed": "المنتج غير موجود في القائمة",
  "What is it? (e.g. Denim jacket)": "ما هي القطعة؟ (مثل عباية سوداء)",
  "Link (optional)": "رابط (اختياري)",
  Done: "تم",
  "Sharing…": "جارٍ النشر…",
  "Your post has been shared.": "تم نشر منشورك.",

  // Brand dashboard
  "View brand page": "عرض صفحة العلامة",
  "Tagged items": "العناصر الموسومة",
  "To review": "للمراجعة",
  Looks: "الإطلالات",
  Creators: "صنّاع المحتوى",
  "Shop clicks · 7d": "نقرات التسوق · 7 أيام",
  "Shop clicks · 30d": "نقرات التسوق · 30 يومًا",
  "Review tags ({n})": "مراجعة الإشارات ({n})",
  "All tags": "كل الإشارات",
  Products: "المنتجات",
  Commissions: "العمولات",
  "Brand profile": "ملف العلامة",
  "All caught up. No tags waiting for review.": "لا توجد إشارات بانتظار المراجعة.",
  "No tags yet.": "لا توجد إشارات بعد.",
  "{n} clicks": "{n} نقرة",
  "their link": "رابطهم",
  "Match to product…": "اربط بمنتج…",
  Confirm: "تأكيد",
  "Not ours": "ليس من منتجاتنا",
  "Tag confirmed.": "تم تأكيد الإشارة.",
  "Tag rejected.": "تم رفض الإشارة.",
  "Product URL": "رابط المنتج",
  Price: "السعر",
  Currency: "العملة",
  Category: "الفئة",
  "Add product": "إضافة منتج",
  Archive: "أرشفة",
  "No products yet. Add products so people can tag the exact item.": "لا توجد منتجات بعد. أضِف منتجاتك ليتمكن الناس من الإشارة إلى القطعة نفسها.",
  "Product added.": "تمت إضافة المنتج.",
  "Archive this product? Existing tags keep their link.": "أرشفة هذا المنتج؟ ستحتفظ الإشارات الحالية برابطها.",
  "Upload logo": "رفع الشعار",
  Website: "الموقع الإلكتروني",
  About: "نبذة",
  Save: "حفظ",
  "Logo updated.": "تم تحديث الشعار.",
  "Brand profile saved.": "تم حفظ ملف العلامة.",
  pending: "قيد الانتظار",
  approved: "معتمدة",
  reversed: "ملغاة",
  confirmed: "مؤكدة",
  rejected: "مرفوضة",

  // Commissions
  "Commission program": "برنامج العمولات",
  "Pay a commission when someone buys after tapping Shop on a look that tags your products. Creators get {share}% of each commission. Orders stay pending for {days} days so refunds can be reversed.":
    "ادفع عمولة عندما يشتري أحدهم بعد الضغط على «تسوّق» في إطلالة تُشير إلى منتجاتك. يحصل صنّاع المحتوى على {share}% من كل عمولة، وتبقى الطلبات قيد الانتظار {days} يومًا لإتاحة إلغاء المبالغ المستردة.",
  "Commission (% of order)": "العمولة (% من الطلب)",
  "e.g. 10": "مثال: 10",
  "Attribution window (days)": "مدة الإسناد (أيام)",
  "Turn on": "تفعيل",
  "Turn off": "إيقاف",
  "Sales via Stylegram": "المبيعات عبر Stylegram",
  "Commission pending": "عمولات قيد الانتظار",
  "Commission approved": "عمولات معتمدة",
  "Connect your store": "اربط متجرك",
  "Stylegram adds <code>sg_click</code> to every Shop link. Keep it (for example in a cookie) until checkout, then have your <b>server</b> report the order. Never put your API key in your website's code.":
    "يضيف Stylegram المعامل <code>sg_click</code> إلى كل رابط تسوّق. احتفظ به (مثلًا في ملف تعريف ارتباط) حتى إتمام الشراء، ثم اجعل <b>خادمك</b> يُبلغ عن الطلب. لا تضع مفتاح API في كود موقعك أبدًا.",
  "API key: {key}": "مفتاح API: {key}",
  "none yet": "لا يوجد بعد",
  "Replace key": "استبدال المفتاح",
  "Create API key": "إنشاء مفتاح API",
  "Recent sales": "أحدث المبيعات",
  Item: "منتج",
  "order {id}": "طلب {id}",
  "No sales reported yet.": "لم يتم الإبلاغ عن مبيعات بعد.",
  "Enter a commission percentage": "أدخل نسبة العمولة",
  "Commission program saved.": "تم حفظ برنامج العمولات.",
  "Turn off commissions? New sales won't be attributed.": "إيقاف العمولات؟ لن تُنسب المبيعات الجديدة.",
  "Replace your API key? The old key stops working immediately.": "استبدال مفتاح API؟ سيتوقف المفتاح القديم عن العمل فورًا.",
  "Your new API key (shown only once; store it on your server)": "مفتاح API الجديد (يظهر مرة واحدة فقط؛ احفظه على خادمك)",
  Copy: "نسخ",
  "Copied.": "تم النسخ.",

  // Earnings
  "When someone buys an item you tagged, from a brand with a Stylegram commission program, you earn {share}% of the commission. Earnings stay pending for {days} days (the refund window), then they're approved.":
    "عندما يشتري أحدهم منتجًا أشرت إليه من علامة تجارية لديها برنامج عمولات على Stylegram، تحصل على {share}% من العمولة. تبقى الأرباح قيد الانتظار {days} يومًا (فترة الاسترداد) ثم تُعتمد.",
  Pending: "قيد الانتظار",
  Approved: "معتمدة",
  look: "الإطلالة",
  "No earnings yet": "لا توجد أرباح بعد",
  "Tag the exact products you're wearing. When people shop your looks, sales show up here.": "أشِر إلى المنتجات التي ترتديها بدقة. عندما يتسوّق الناس من إطلالاتك ستظهر المبيعات هنا.",
  "Payouts aren't automatic yet. Approved earnings are paid out by the Stylegram team.": "الدفعات ليست تلقائية بعد. يدفع فريق Stylegram الأرباح المعتمدة.",

  // Admin
  "Brands waiting for verification": "علامات تجارية بانتظار التحقق",
  "trade licence: {n}": "الرخصة التجارية: {n}",
  "not given": "غير مذكورة",
  Verify: "تحقق",
  None: "لا يوجد",
  "Brand claims": "طلبات إدارة العلامات",
  "claimed by @{user} ({email})": "طلبها @{user} ({email})",
  Approve: "موافقة",
  Reject: "رفض",
  "Blocked uploads": "صور محظورة",
  "Photos the AI check rejected. The images themselves are never stored.": "صور رفضها الفحص الآلي. لا يتم تخزين الصور نفسها أبدًا.",
  "deleted user": "مستخدم محذوف",
  "Done.": "تم.",

  // Language names (for "Translated from …")
  English: "الإنجليزية",
  Arabic: "العربية",
};

/** Human name of a content language code, in the interface language. */
export function languageName(code) {
  try {
    return new Intl.DisplayNames([locale()], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
