Component({
  options: { multipleSlots: true },
  properties: { title: String, updated: Boolean },
  data: { rows: ['商品信息', '优惠与抵扣', '配送方式', '付款结果'], scrollTop: 0 },
  methods: { onScroll() {} },
});
