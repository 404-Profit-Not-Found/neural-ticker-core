export class ColumnNumericTransformer {
  to(data: number | null): number | null {
    return data;
  }
  from(data: string | null): number | null {
    if (!data) return null;
    const res = parseFloat(data);
    return isNaN(res) ? null : res;
  }
}
