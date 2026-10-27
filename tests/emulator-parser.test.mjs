import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFirestoreValue, parseFirestoreDocument } from '../tools/inventory/read-emulator-snapshot.mjs';

test('1. Conversor de Snapshot do Emulador: converte tipos nativos do Firestore REST/Protobuf', () => {
  const rawProtoDoc = {
    name: 'projects/demo-unispect-test/databases/(default)/documents/bookings/bk_99',
    fields: {
      bookingNumber: { stringValue: 'MEDU992019' },
      bagsQuantity: { integerValue: '640' },
      status: { stringValue: 'Finalizado' },
      containers: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  containerNumber: { stringValue: 'MSDU8821297' },
                  tara: { stringValue: '2200' },
                  photos: {
                    arrayValue: {
                      values: [
                        {
                          mapValue: {
                            fields: {
                              id: { stringValue: 'photo_01' },
                              storagePath: { stringValue: 'containers/c_1/photo_01.jpg' }
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              }
            }
          ]
        }
      }
    }
  };

  const parsed = parseFirestoreDocument(rawProtoDoc);

  assert.equal(parsed.id, 'bk_99');
  assert.equal(parsed.data.bookingNumber, 'MEDU992019');
  assert.equal(parsed.data.bagsQuantity, 640);
  assert.equal(parsed.data.status, 'Finalizado');
  assert.equal(Array.isArray(parsed.data.containers), true);
  assert.equal(parsed.data.containers[0].containerNumber, 'MSDU8821297');
  assert.equal(parsed.data.containers[0].tara, '2200');
  assert.equal(parsed.data.containers[0].photos[0].id, 'photo_01');
  assert.equal(parsed.data.containers[0].photos[0].storagePath, 'containers/c_1/photo_01.jpg');
});
