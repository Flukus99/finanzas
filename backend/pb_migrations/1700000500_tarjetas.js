/// <reference path="../pb_data/types.d.ts" />
// Tarjetas de crédito como medio de pago: cupo y día de corte en la deuda;
// las compras quedan en transactions.card (sin cuenta) con su número de cuotas.
migrate((app) => {
  const d = app.findCollectionByNameOrId("debts")
  d.fields.add(new NumberField({ name: "limit", min: 0 }))   // cupo total
  d.fields.add(new NumberField({ name: "cut_day", min: 0, max: 31 })) // día de corte
  app.save(d)
  const tx = app.findCollectionByNameOrId("transactions")
  tx.fields.add(new TextField({ name: "card", max: 30 }))     // compra con esta tarjeta
  tx.fields.add(new NumberField({ name: "card_n", min: 0, max: 72 })) // a cuántas cuotas
  app.save(tx)
  const r = app.findCollectionByNameOrId("recurring")
  r.fields.add(new TextField({ name: "card", max: 30 }))      // fijo que se carga a una tarjeta
  app.save(r)
}, (app) => {
  const d = app.findCollectionByNameOrId("debts"); d.fields.removeByName("limit"); d.fields.removeByName("cut_day"); app.save(d)
  const tx = app.findCollectionByNameOrId("transactions"); tx.fields.removeByName("card"); tx.fields.removeByName("card_n"); app.save(tx)
  const r = app.findCollectionByNameOrId("recurring"); r.fields.removeByName("card"); app.save(r)
})
