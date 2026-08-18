import request from './request';

export const batchAPI = {
  booking: (data) => request.post('/batch/bookings', data),
  print: (data) => request.post('/batch/print', data),
};