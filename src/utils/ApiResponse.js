export const ok = (res, data, message = "OK", meta) =>
  res.json({ success: true, data, message, ...(meta && { meta }) });

export const created = (res, data, message = "Yaratildi") =>
  res.status(201).json({ success: true, data, message });

export const noContent = (res) => res.status(204).end();
