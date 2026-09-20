import type { FlexMessage, TemplateField, TemplateId } from "./types";
import { ACCENT } from "./types";

const DEMO_IMG = (seed: number, w = 1024, h = 576) =>
  `https://picsum.photos/seed/linedev${seed}/${w}/${h}`;

export const TEMPLATE_META: {
  id: TemplateId;
  label: string;
  labelTh: string;
  description: string;
}[] = [
  { id: "bubble-simple", label: "bubble-simple", labelTh: "บับเบิลง่าย", description: "ข้อความ + ปุ่ม URI 1 ปุ่ม" },
  { id: "bubble-hero", label: "bubble-hero", labelTh: "บับเบิลฮีโร่", description: "รูป hero + หัวข้อ + เนื้อหา + ปุ่ม 1–2" },
  { id: "carousel", label: "carousel", labelTh: "คารูเซล", description: "2–3 การ์ดพร้อมรูป + หัวข้อ + ปุ่ม" },
  { id: "product-card", label: "product-card", labelTh: "การ์ดสินค้า", description: "รูป สินค้า ราคา ดูรายละเอียด + แชร์" },
  { id: "news-list", label: "news-list", labelTh: "รายการข่าว", description: "รายการแนวตั้ง รูปย่อ + หัวข้อ + URI" },
  { id: "raw-json", label: "raw-json", labelTh: "JSON จาก Simulator", description: "วาง JSON จาก LINE Flex Message Simulator" },
];

const LABELS: Record<string, string> = {
  altText: "Alt text (ข้อความสำรอง)",
  title: "หัวข้อ",
  body: "เนื้อหา",
  buttonLabel: "ข้อความปุ่ม",
  buttonUrl: "URL ปุ่ม",
  heroImage: "URL รูป Hero (HTTPS)",
  button1Label: "ปุ่ม 1 — ข้อความ",
  button1Url: "ปุ่ม 1 — URL",
  button2Label: "ปุ่ม 2 — ข้อความ (ว่าง = ซ่อน)",
  button2Url: "ปุ่ม 2 — URL",
  cardCount: "จำนวนการ์ด (2 หรือ 3)",
  c1Image: "การ์ด 1 — รูป",
  c1Title: "การ์ด 1 — หัวข้อ",
  c1ButtonLabel: "การ์ด 1 — ปุ่ม",
  c1ButtonUrl: "การ์ด 1 — URL",
  c2Image: "การ์ด 2 — รูป",
  c2Title: "การ์ด 2 — หัวข้อ",
  c2ButtonLabel: "การ์ด 2 — ปุ่ม",
  c2ButtonUrl: "การ์ด 2 — URL",
  c3Image: "การ์ด 3 — รูป",
  c3Title: "การ์ด 3 — หัวข้อ",
  c3ButtonLabel: "การ์ด 3 — ปุ่ม",
  c3ButtonUrl: "การ์ด 3 — URL",
  image: "URL รูปสินค้า",
  name: "ชื่อสินค้า",
  price: "ราคา",
  detailUrl: "URL ดูรายละเอียด",
  shareUrl: "URL แชร์",
  showShare: "แสดงปุ่มแชร์ (true/false)",
  header: "หัวรายการ",
  i1Thumb: "ข่าว 1 — รูปย่อ",
  i1Title: "ข่าว 1 — หัวข้อ",
  i1Url: "ข่าว 1 — URL",
  i2Thumb: "ข่าว 2 — รูปย่อ",
  i2Title: "ข่าว 2 — หัวข้อ",
  i2Url: "ข่าว 2 — URL",
  i3Thumb: "ข่าว 3 — รูปย่อ",
  i3Title: "ข่าว 3 — หัวข้อ",
  i3Url: "ข่าว 3 — URL",
  rawContents: "Flex contents JSON",
};

export function defaultFields(id: TemplateId): Record<string, string> {
  switch (id) {
    case "bubble-simple":
      return {
        altText: "ข้อความจาก Softnix LineDev",
        title: "สวัสดีจาก Softnix",
        body: "นี่คือ Flex Message แบบ bubble-simple สำหรับทดสอบ LINE Messaging API",
        buttonLabel: "เปิดเว็บไซต์",
        buttonUrl: "https://softnix.ai",
      };
    case "bubble-hero":
      return {
        altText: "Softnix Hero Flex",
        heroImage: DEMO_IMG(1, 1040, 600),
        title: "Softnix Knowledge AI",
        body: "ค้นหาความรู้ในองค์กรได้ทันที ด้วย AI ที่เข้าใจเอกสารภาษาไทย",
        button1Label: "เริ่มต้นใช้งาน",
        button1Url: "https://softnix.ai",
        button2Label: "ดูรายละเอียด",
        button2Url: "https://softnix.ai",
      };
    case "carousel":
      return {
        altText: "Softnix Carousel",
        cardCount: "3",
        c1Image: DEMO_IMG(11, 800, 500),
        c1Title: "Data Lakehouse",
        c1ButtonLabel: "ดูเพิ่ม",
        c1ButtonUrl: "https://softnix.ai",
        c2Image: DEMO_IMG(12, 800, 500),
        c2Title: "Logger CyBOT",
        c2ButtonLabel: "ดูเพิ่ม",
        c2ButtonUrl: "https://softnix.ai",
        c3Image: DEMO_IMG(13, 800, 500),
        c3Title: "Knowledge AI",
        c3ButtonLabel: "ดูเพิ่ม",
        c3ButtonUrl: "https://softnix.ai",
      };
    case "product-card":
      return {
        altText: "สินค้า Softnix",
        image: DEMO_IMG(21, 800, 800),
        name: "Softnix Logger Pro",
        price: "฿12,900 / ปี",
        detailUrl: "https://softnix.ai",
        shareUrl: "https://softnix.ai",
        showShare: "true",
      };
    case "news-list":
      return {
        altText: "ข่าว Softnix",
        header: "ข่าวล่าสุดจาก Softnix",
        i1Thumb: DEMO_IMG(31, 200, 200),
        i1Title: "เปิดตัว Knowledge AI สำหรับองค์กร",
        i1Url: "https://softnix.ai",
        i2Thumb: DEMO_IMG(32, 200, 200),
        i2Title: "อัปเดต Softnix Logger CyBOT",
        i2Url: "https://softnix.ai",
        i3Thumb: DEMO_IMG(33, 200, 200),
        i3Title: "แนวทาง PDPA กับ AI ในองค์กร",
        i3Url: "https://softnix.ai",
      };
    case "raw-json":
      return {
        altText: "Flex Message",
        rawContents: JSON.stringify(
          {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "วาง JSON จาก Flex Simulator",
                  weight: "bold",
                  size: "lg",
                  color: "#2786C2",
                },
                {
                  type: "text",
                  text: "ออกแบบใน Simulator แล้วคัดลอก JSON มาวางที่นี่",
                  wrap: true,
                  margin: "md",
                },
              ],
            },
          },
          null,
          2
        ),
      };
  }
}

export function fieldDefs(id: TemplateId): TemplateField[] {
  const f = defaultFields(id);
  return Object.keys(f).map((key) => {
    let type: TemplateField["type"] = "text";
    if (key === "body" || key === "rawContents") type = "textarea";
    if (/Url|Image|image|Thumb|thumb/.test(key)) type = "url";
    return { key, label: LABELS[key] || key, type, defaultValue: f[key] };
  });
}

function uriButton(label: string, uri: string, primary = true) {
  return {
    type: "button",
    style: primary ? "primary" : "secondary",
    ...(primary ? { color: ACCENT } : {}),
    action: { type: "uri", label, uri },
  };
}

export function buildFlex(
  id: TemplateId,
  fields: Record<string, string>
): FlexMessage {
  const altText = fields.altText || "Flex Message";

  if (id === "raw-json") {
    let contents: Record<string, unknown>;
    try {
      contents = JSON.parse(fields.rawContents || "{}");
    } catch {
      contents = {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "Invalid JSON in rawContents",
              color: "#FF0000",
              wrap: true,
            },
          ],
        },
      };
    }
    return { type: "flex", altText, contents };
  }

  if (id === "bubble-simple") {
    return {
      type: "flex",
      altText,
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: fields.title || "Title",
              weight: "bold",
              size: "lg",
              color: ACCENT,
            },
            {
              type: "text",
              text: fields.body || "",
              wrap: true,
              margin: "md",
              size: "sm",
              color: "#333333",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            uriButton(
              fields.buttonLabel || "Open",
              fields.buttonUrl || "https://softnix.ai"
            ),
          ],
        },
      },
    };
  }

  if (id === "bubble-hero") {
    const buttons = [
      uriButton(
        fields.button1Label || "Button 1",
        fields.button1Url || "https://softnix.ai",
        true
      ),
    ];
    if ((fields.button2Label || "").trim()) {
      buttons.push(
        uriButton(
          fields.button2Label,
          fields.button2Url || "https://softnix.ai",
          false
        )
      );
    }
    return {
      type: "flex",
      altText,
      contents: {
        type: "bubble",
        hero: {
          type: "image",
          url: fields.heroImage || DEMO_IMG(1),
          size: "full",
          aspectRatio: "20:13",
          aspectMode: "cover",
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: fields.title || "Title",
              weight: "bold",
              size: "xl",
              color: ACCENT,
            },
            {
              type: "text",
              text: fields.body || "",
              wrap: true,
              margin: "md",
              size: "sm",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: buttons,
        },
      },
    };
  }

  if (id === "carousel") {
    const count = Math.min(
      3,
      Math.max(2, parseInt(fields.cardCount || "3", 10) || 3)
    );
    const cards = [];
    for (let i = 1; i <= count; i++) {
      cards.push({
        type: "bubble",
        hero: {
          type: "image",
          url: fields[`c${i}Image`] || DEMO_IMG(10 + i),
          size: "full",
          aspectRatio: "20:13",
          aspectMode: "cover",
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: fields[`c${i}Title`] || `Card ${i}`,
              weight: "bold",
              size: "md",
              color: ACCENT,
              wrap: true,
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            uriButton(
              fields[`c${i}ButtonLabel`] || "เปิด",
              fields[`c${i}ButtonUrl`] || "https://softnix.ai"
            ),
          ],
        },
      });
    }
    return {
      type: "flex",
      altText,
      contents: { type: "carousel", contents: cards },
    };
  }

  if (id === "product-card") {
    const footerContents: unknown[] = [
      uriButton("ดูรายละเอียด", fields.detailUrl || "https://softnix.ai", true),
    ];
    if ((fields.showShare || "true").toLowerCase() !== "false") {
      footerContents.push(
        uriButton(
          "แชร์",
          fields.shareUrl || fields.detailUrl || "https://softnix.ai",
          false
        )
      );
    }
    return {
      type: "flex",
      altText,
      contents: {
        type: "bubble",
        hero: {
          type: "image",
          url: fields.image || DEMO_IMG(21, 800, 800),
          size: "full",
          aspectRatio: "1:1",
          aspectMode: "cover",
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: fields.name || "Product",
              weight: "bold",
              size: "lg",
              wrap: true,
            },
            {
              type: "text",
              text: fields.price || "",
              size: "xl",
              color: ACCENT,
              weight: "bold",
              margin: "md",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: footerContents,
        },
      },
    };
  }

  const items = [1, 2, 3].map((i) => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    margin: i === 1 ? "none" : "lg",
    action: {
      type: "uri",
      label: "open",
      uri: fields[`i${i}Url`] || "https://softnix.ai",
    },
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: "60px",
        height: "60px",
        contents: [
          {
            type: "image",
            url: fields[`i${i}Thumb`] || DEMO_IMG(30 + i, 200, 200),
            aspectMode: "cover",
            aspectRatio: "1:1",
            size: "full",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        justifyContent: "center",
        contents: [
          {
            type: "text",
            text: fields[`i${i}Title`] || `ข่าว ${i}`,
            wrap: true,
            size: "sm",
            weight: "bold",
            color: "#222222",
          },
          {
            type: "text",
            text: "อ่านต่อ →",
            size: "xs",
            color: ACCENT,
            margin: "sm",
          },
        ],
      },
    ],
  }));

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: fields.header || "ข่าวล่าสุด",
            weight: "bold",
            size: "lg",
            color: ACCENT,
          },
          { type: "separator", margin: "md" },
          ...items,
        ],
      },
    },
  };
}
