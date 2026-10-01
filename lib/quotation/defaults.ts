// Defaults for a new quotation, from quotation SAS/QT/2026-27/045. Every one is
// editable per quotation.
export const DEFAULT_TERMS = {
  paymentTerms: "100% advance.",
  extendedWarranty: "Rs 45,000/- per year Plus GST for 3 Years",
  deliveryTerms: [
    "Delivery - Within 2-3 weeks from the date of receipt of your order with full amount.",
    "Freight charges included.",
    "Installation & Training support will be provided online",
    "Onsite Training @ 50,000+18% GST",
  ].join("\n"),
  validity: "30 days",
};

export const GST_RATES = ["0", "5", "12", "18", "28"];
export const DEFAULT_GST_RATE = "5";

/** The first line of a new quotation. */
export const DEFAULT_ITEM = {
  itemName: "OralScan",
  shortDescription: "Hand-held Imaging System",
  description: [
    "with",
    "a. Probe Holder",
    "b. Calibration Stand with Tissue Phantom",
    "c. Warranty for 2 year",
    "d. Laptop with Digital Pen for RoI marking and Windows10 installed",
    "e. OralView intra oral 2MPx camera for taking the image with 1 year warranty",
    "f. Carry case",
    "g. OralScan software with cloud support",
  ].join("\n"),
  hsnCode: "90189099",
  quantity: "1",
  rate: "730000",
  gstRate: DEFAULT_GST_RATE,
};
