/// <reference path="../pb_data/types.d.ts" />
// Al crear un usuario le damos cuentas y categorías iniciales.
// Se hace en el servidor (y no en cada dispositivo) para que no salgan duplicadas.
// Ojo: en PocketBase los handlers no ven variables de afuera, todo va adentro.
onRecordAfterCreateSuccess((e) => {
  const uid = e.record.id
  const add = (colName, data) => {
    const r = new Record(e.app.findCollectionByNameOrId(colName))
    r.set("user", uid)
    for (const k in data) r.set(k, data[k])
    e.app.save(r)
  }
  const gastos = [
    ["Comida", "🍔", "#ff9f0a"], ["Mercado", "🛒", "#30d158"], ["Transporte", "🚌", "#0a84ff"],
    ["Hogar", "🏠", "#ac8e68"], ["Servicios", "💡", "#ffd60a"], ["Salud", "💊", "#ff375f"],
    ["Entretenimiento", "🎬", "#bf5af2"], ["Ropa", "👕", "#64d2ff"], ["Educación", "📚", "#5e5ce6"],
    ["Tarjetas", "💳", "#ff9f0a"], ["Suscripciones", "📺", "#bf5af2"], ["Seguros", "🛡️", "#64d2ff"],
    ["Impuestos", "🏛️", "#8e8e93"], ["Deudas", "🧾", "#ff453a"], ["Otros gastos", "📦", "#8e8e93"],
  ]
  const ingresos = [["Salario", "💼", "#30d158"], ["Ventas", "💰", "#ffd60a"], ["Otros ingresos", "✨", "#64d2ff"]]
  for (const [name, icon, color] of gastos) add("categories", { name, icon, color, kind: "gasto" })
  for (const [name, icon, color] of ingresos) add("categories", { name, icon, color, kind: "ingreso" })
  add("accounts", { name: "Efectivo", kind: "efectivo", initial: 0, color: "#30d158" })
  add("accounts", { name: "Banco", kind: "banco", initial: 0, color: "#0a84ff" })
  e.next()
}, "users")
