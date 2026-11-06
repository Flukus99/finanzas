/// <reference path="../pb_data/types.d.ts" />
// 4x1000 (GMF) por cuenta: "aplica" (paga siempre), "exenta" o "tope" (exenta hasta gmf_limit al mes).
migrate((app) => {
  const c = app.findCollectionByNameOrId("accounts")
  c.fields.add(new SelectField({ name: "gmf", values: ["aplica", "exenta", "tope"], maxSelect: 1 }))
  c.fields.add(new NumberField({ name: "gmf_limit", min: 0 }))
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId("accounts")
  c.fields.removeByName("gmf"); c.fields.removeByName("gmf_limit")
  app.save(c)
})
