export function hungarian(costMatrix: number[][]): number[] {
  const size = costMatrix.length;
  const u = new Float64Array(size + 1);
  const v = new Float64Array(size + 1);
  const p = new Int32Array(size + 1);
  const way = new Int32Array(size + 1);

  for (let row = 1; row <= size; row++) {
    p[0] = row;
    let column = 0;
    const minValue = new Float64Array(size + 1).fill(Infinity);
    const used = new Uint8Array(size + 1);

    do {
      used[column] = 1;
      const currentRow = p[column];
      let delta = Infinity;
      let nextColumn = -1;

      for (let candidateColumn = 1; candidateColumn <= size; candidateColumn++) {
        if (used[candidateColumn]) continue;
        const cost =
          costMatrix[currentRow - 1][candidateColumn - 1] - u[currentRow] - v[candidateColumn];
        if (cost < minValue[candidateColumn]) {
          minValue[candidateColumn] = cost;
          way[candidateColumn] = column;
        }
        if (minValue[candidateColumn] < delta) {
          delta = minValue[candidateColumn];
          nextColumn = candidateColumn;
        }
      }

      for (let candidateColumn = 0; candidateColumn <= size; candidateColumn++) {
        if (used[candidateColumn]) {
          u[p[candidateColumn]] += delta;
          v[candidateColumn] -= delta;
        } else {
          minValue[candidateColumn] -= delta;
        }
      }

      column = nextColumn;
    } while (p[column] !== 0);

    do {
      const nextColumn = way[column];
      p[column] = p[nextColumn];
      column = nextColumn;
    } while (column !== 0);
  }

  const assignment = new Array<number>(size);
  for (let column = 1; column <= size; column++) {
    if (p[column] !== 0) {
      assignment[p[column] - 1] = column - 1;
    }
  }

  return assignment;
}
